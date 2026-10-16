import os
import json
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, render_template, request, redirect, url_for,
                   session, jsonify, send_from_directory, flash, abort)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from config import Config
from models import (db, User, StudentVerification, Post, Like, Comment,
                    ChatRoom, ChatMember, ChatMessage,
                    Listing, Assignment, Event, EventRSVP, Connection,
                    Follow, ProfileView, AdminAction)
from ai_check import analyze_image
from dotenv import load_dotenv
load_dotenv()   # reads .env and sets env vars

app = Flask(__name__)
app.config.from_object(Config)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
db.init_app(app)

socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')


# ─────────────────────────────────────────────
# JINJA FILTERS
# ─────────────────────────────────────────────
@app.template_filter('fromjson')
def fromjson_filter(s):
    try:
        return json.loads(s) if s else []
    except (ValueError, TypeError):
        return []


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']


def allowed_image(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'webp'}


def current_user():
    uid = session.get('user_id')
    return db.session.get(User, uid) if uid else None


def user_avatar(user):
    if not user:
        return None
    if getattr(user, 'profile_picture_path', None):
        return url_for('uploaded_file', filename=user.profile_picture_path)
    return None


def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get('user_id'):
            return redirect(url_for('login'))
        return f(*a, **k)
    return w


def verified_required(f):
    @wraps(f)
    def w(*a, **k):
        u = current_user()
        if not u:
            return redirect(url_for('login'))
        if u.role != 'admin' and u.verification_status != 'verified':
            return redirect(url_for('pending'))
        return f(*a, **k)
    return w


def save_upload(file, prefix):
    filename = secure_filename(f"{prefix}_{int(datetime.utcnow().timestamp())}_{file.filename}")
    path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(path)
    return filename


def time_ago(dt):
    if not dt:
        return 'now'
    secs = int((datetime.utcnow() - dt).total_seconds())
    if secs < 60: return 'now'
    if secs < 3600: return f'{secs // 60}m'
    if secs < 86400: return f'{secs // 3600}h'
    return f'{secs // 86400}d'


# ─────────────────────────────────────────────
# ADMIN SECURITY HELPERS
# ─────────────────────────────────────────────
def admin_session_expired():
    """True if admin session has timed out."""
    last = session.get('admin_last_seen')
    if not last:
        return True
    cutoff = datetime.utcnow() - timedelta(minutes=app.config['ADMIN_SESSION_MINUTES'])
    try:
        return datetime.fromisoformat(last) < cutoff
    except (ValueError, TypeError):
        return True


def touch_admin_session():
    session['admin_last_seen'] = datetime.utcnow().isoformat()


def log_admin_action(action, target_user_id=None, detail=''):
    u = current_user()
    if not u:
        return
    log = AdminAction(
        admin_id=u.id,
        action=action,
        target_user_id=target_user_id,
        target_detail=(detail or '')[:255],
        ip_address=request.remote_addr or '',
    )
    db.session.add(log)
    db.session.commit()


def is_admin_unlocked():
    u = current_user()
    if not u or u.role != 'admin':
        return False
    if not session.get('admin_unlocked'):
        return False
    if admin_session_expired():
        session.pop('admin_unlocked', None)
        session.pop('admin_last_seen', None)
        return False
    return True


# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────
@app.route('/')
def index():
    u = current_user()
    if not u:
        return redirect(url_for('login'))
    if u.role == 'admin':
        return redirect(url_for('admin'))
    if u.verification_status == 'verified':
        return redirect(url_for('home'))
    return redirect(url_for('pending'))


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        full_name = request.form.get('full_name', '').strip()
        email = request.form.get('email', '').strip().lower()
        phone = request.form.get('phone', '').strip()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm', '')

        errors = []
        if not full_name: errors.append('Full name is required')
        if not email or '@' not in email: errors.append('Valid email is required')
        if len(password) < 6: errors.append('Password must be at least 6 characters')
        if password != confirm: errors.append('Passwords do not match')
        if User.query.filter_by(email=email).first(): errors.append('Email already registered')

        if errors:
            for e in errors: flash(e, 'error')
            return render_template('signup.html', form=request.form)

        user = User(full_name=full_name, email=email, phone=phone,
                    password_hash=generate_password_hash(password),
                    avatar_seed=email, verification_status='unverified')
        db.session.add(user)
        db.session.commit()
        session['user_id'] = user.id
        return redirect(url_for('verify'))

    return render_template('signup.html', form={})


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        u = User.query.filter_by(email=email).first()
        if not u or not check_password_hash(u.password_hash, password):
            flash('Invalid email or password', 'error')
            return render_template('login.html')
        session['user_id'] = u.id
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
# VERIFICATION
# ─────────────────────────────────────────────
@app.route('/verify', methods=['GET', 'POST'])
@login_required
def verify():
    u = current_user()
    if u.verification_status == 'verified':
        return redirect(url_for('home'))
    if u.verification_status == 'pending':
        return redirect(url_for('pending'))

    if request.method == 'POST':
        matric = request.form.get('matric_no', '').strip()
        faculty = request.form.get('faculty', '').strip()
        department = request.form.get('department', '').strip()
        level = request.form.get('level', '').strip()
        year = request.form.get('admission_year', '').strip()
        file = request.files.get('admission_letter')

        errors = []
        if not matric: errors.append('Matric number required')
        if not faculty: errors.append('Faculty required')
        if not department: errors.append('Department required')
        if not level: errors.append('Level required')
        if not year: errors.append('Admission year required')
        if not file or file.filename == '': errors.append('Admission letter required')

        if errors:
            for e in errors: flash(e, 'error')
            return render_template('verify.html', form=request.form)

        if not allowed_file(file.filename):
            flash('Only PNG, JPG, JPEG, WEBP, or PDF allowed', 'error')
            return render_template('verify.html', form=request.form)

        existing = StudentVerification.query.filter_by(matric_no=matric).first()
        if existing and existing.user_id != u.id:
            flash('This matric number is already registered', 'error')
            return render_template('verify.html', form=request.form)

        filename = save_upload(file, f'u{u.id}')
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        score, flags = analyze_image(filepath)

        if score >= 75:
            try: os.remove(filepath)
            except OSError: pass
            flash(f'Upload rejected — appears AI-generated ({int(score)}%). Please upload a real photo.', 'error')
            return render_template('verify.html', form=request.form)

        if existing and existing.user_id == u.id:
            old = os.path.join(app.config['UPLOAD_FOLDER'], existing.admission_letter_path or '')
            if existing.admission_letter_path and os.path.exists(old):
                try: os.remove(old)
                except OSError: pass
            db.session.delete(existing)
            db.session.commit()

        v = StudentVerification(user_id=u.id, matric_no=matric, faculty=faculty,
                                department=department, level=level, admission_year=year,
                                admission_letter_path=filename, status='pending',
                                ai_score=score, ai_flags=json.dumps(flags))
        db.session.add(v)
        u.verification_status = 'pending'
        db.session.commit()
        return redirect(url_for('pending'))

    return render_template('verify.html', form={})


@app.route('/pending')
@login_required
def pending():
    u = current_user()
    if u.verification_status == 'verified':
        return redirect(url_for('home'))
    v = StudentVerification.query.filter_by(user_id=u.id).first()
    return render_template('pending.html', user=u, verification=v)


# ─────────────────────────────────────────────
# HOME
# ─────────────────────────────────────────────
@app.route('/home')
@verified_required
def home():
    return render_template('home.html', user=current_user())


# ─────────────────────────────────────────────
# FEED — ranked / personalized
# ─────────────────────────────────────────────
def serialize_post(p, me_id):
    liked = any(l.user_id == me_id for l in p.likes)
    if p.anonymous:
        author, avatar, user_id = 'Anonymous Student', None, None
    else:
        author = p.author.full_name
        avatar = user_avatar(p.author)
        user_id = p.author.id

    return {
        'id': p.id,
        'user_id': user_id,
        'author': author,
        'avatar': avatar,
        'anonymous': p.anonymous,
        'verified': not p.anonymous,
        'time': time_ago(p.created_at),
        'tag': p.tag,
        'content': p.content,
        'image': url_for('uploaded_file', filename=p.image_path) if p.image_path else None,
        'likes': len(p.likes),
        'comments': len(p.comments),
        'liked': liked,
    }


@app.route('/api/feed')
@verified_required
def api_feed():
    me = current_user()
    f = request.args.get('filter', 'all')

    followed_ids = {r.following_id for r in Follow.query.filter_by(follower_id=me.id).all()}

    like_counts = dict(
        db.session.query(Post.user_id, db.func.count(Like.id))
        .join(Like, Like.post_id == Post.id)
        .filter(Like.user_id == me.id)
        .group_by(Post.user_id)
        .all()
    )

    view_counts = dict(
        db.session.query(ProfileView.viewed_id, db.func.count(ProfileView.id))
        .filter(ProfileView.viewer_id == me.id)
        .group_by(ProfileView.viewed_id)
        .all()
    )

    tag_rows = db.session.query(Post.tag)\
        .join(Like, Like.post_id == Post.id)\
        .filter(Like.user_id == me.id)\
        .distinct().all()
    interest_tags = {t[0] for t in tag_rows if t[0]}

    q = Post.query
    if f == 'anon':
        q = q.filter_by(anonymous=True)
    elif f in ('gist', 'parties', 'market', 'assign'):
        q = q.filter_by(tag=f)

    posts = q.limit(300).all()

    now = datetime.utcnow()

    def score(p):
        s = 0
        age_hours = max(0, (now - p.created_at).total_seconds() / 3600)
        s += max(0, 100 - age_hours)

        if p.user_id in followed_ids:
            s += 300

        lc = like_counts.get(p.user_id, 0)
        if lc >= 2:
            s += 80 * min(lc, 5)

        vc = view_counts.get(p.user_id, 0)
        if vc >= 2:
            s += 60 * min(vc, 5)

        if p.tag in interest_tags:
            s += 50

        return s

    posts.sort(key=score, reverse=True)
    return jsonify([serialize_post(p, me.id) for p in posts[:100]])


@app.route('/api/posts', methods=['POST'])
@verified_required
def api_create_post():
    if request.content_type and 'multipart/form-data' in request.content_type:
        content = request.form.get('content', '').strip()
        anon = request.form.get('anonymous', 'false').lower() == 'true'
        tag = request.form.get('tag') or ('anon' if anon else 'gist')
        image = request.files.get('image')
        image_path = None
        if image and image.filename and allowed_image(image.filename):
            image_path = save_upload(image, f'post{current_user().id}')
    else:
        d = request.get_json() or {}
        content = (d.get('content') or '').strip()
        anon = bool(d.get('anonymous'))
        tag = d.get('tag') or ('anon' if anon else 'gist')
        image_path = None

    if not content:
        return jsonify({'error': 'Content required'}), 400

    p = Post(user_id=current_user().id, content=content,
             anonymous=anon, tag=tag, image_path=image_path)
    db.session.add(p)
    db.session.commit()
    return jsonify(serialize_post(p, current_user().id))


@app.route('/api/posts/<int:pid>/like', methods=['POST'])
@verified_required
def api_like(pid):
    me = current_user().id
    p = Post.query.get_or_404(pid)
    existing = Like.query.filter_by(user_id=me, post_id=pid).first()
    if existing:
        db.session.delete(existing); liked = False
    else:
        db.session.add(Like(user_id=me, post_id=pid)); liked = True
    db.session.commit()
    return jsonify({'liked': liked, 'likes': len(p.likes)})


@app.route('/api/posts/<int:pid>/comments', methods=['GET', 'POST'])
@verified_required
def api_comments(pid):
    p = Post.query.get_or_404(pid)
    me = current_user()
    if request.method == 'POST':
        d = request.get_json() or {}
        content = (d.get('content') or '').strip()
        anon = bool(d.get('anonymous'))
        if not content:
            return jsonify({'error': 'Empty'}), 400
        db.session.add(Comment(user_id=me.id, post_id=pid, content=content, anonymous=anon))
        db.session.commit()

    return jsonify([{
        'id': c.id,
        'author': 'Anonymous' if c.anonymous else c.user.full_name,
        'anonymous': c.anonymous,
        'avatar': None if c.anonymous else user_avatar(c.user),
        'content': c.content,
        'time': time_ago(c.created_at),
    } for c in p.comments])


@app.route('/uploads/<path:filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    # ─────────────────────────────────────────────
# PWA — manifest + service worker at root scope
# ─────────────────────────────────────────────
@app.route('/manifest.json')
def pwa_manifest():
    response = send_from_directory(
        'static', 'manifest.json',
        mimetype='application/manifest+json'
    )
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response


@app.route('/sw.js')
def pwa_service_worker():
    response = send_from_directory(
        'static', 'sw.js',
        mimetype='application/javascript'
    )
    # Allow SW to control the whole site
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response


# ─────────────────────────────────────────────
# Android Digital Asset Links (for full-screen TWA)
# ─────────────────────────────────────────────
@app.route('/.well-known/assetlinks.json')
def assetlinks():
    path = os.path.join(app.root_path, '.well-known', 'assetlinks.json')
    if not os.path.exists(path):
        return jsonify([]), 404
    return send_from_directory(
        os.path.join(app.root_path, '.well-known'),
        'assetlinks.json',
        mimetype='application/json'
    )


# ─────────────────────────────────────────────
# MARKETPLACE
# ─────────────────────────────────────────────
@app.route('/market')
@verified_required
def market():
    return render_template('market.html', user=current_user())


@app.route('/api/listings', methods=['GET', 'POST'])
@verified_required
def api_listings():
    me = current_user()
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        description = request.form.get('description', '').strip()
        price = request.form.get('price', '')
        category = request.form.get('category', 'other')
        image = request.files.get('image')

        if not title or not price:
            return jsonify({'error': 'Title and price required'}), 400

        try:
            price = float(price)
        except ValueError:
            return jsonify({'error': 'Invalid price'}), 400

        image_path = None
        if image and image.filename and allowed_image(image.filename):
            image_path = save_upload(image, f'list{me.id}')

        listing = Listing(user_id=me.id, title=title, description=description,
                          price=price, category=category, image_path=image_path)
        db.session.add(listing)
        db.session.commit()
        return jsonify(serialize_listing(listing, me.id))

    category = request.args.get('category', 'all')
    q = Listing.query.order_by(Listing.created_at.desc())
    if category != 'all':
        q = q.filter_by(category=category)
    listings = q.limit(100).all()
    return jsonify([serialize_listing(l, me.id) for l in listings])


def serialize_listing(l, me_id):
    return {
        'id': l.id,
        'title': l.title,
        'description': l.description,
        'price': l.price,
        'category': l.category,
        'image': url_for('uploaded_file', filename=l.image_path) if l.image_path else None,
        'sold': l.sold,
        'seller': l.seller.full_name,
        'seller_id': l.seller.id,
        'mine': l.user_id == me_id,
        'time': time_ago(l.created_at),
    }


@app.route('/api/listings/<int:lid>/sold', methods=['POST'])
@verified_required
def api_listing_sold(lid):
    l = Listing.query.get_or_404(lid)
    if l.user_id != current_user().id and current_user().role != 'admin':
        abort(403)
    l.sold = not l.sold
    db.session.commit()
    return jsonify({'sold': l.sold})


# ─────────────────────────────────────────────
# ASSIGNMENTS
# ─────────────────────────────────────────────
ALLOWED_ASSIGNMENT_FILES = {'png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt'}


def allowed_assignment_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_ASSIGNMENT_FILES


@app.route('/assignments')
@verified_required
def assignments():
    return render_template('assignments.html', user=current_user())


@app.route('/api/assignments', methods=['GET', 'POST'])
@verified_required
def api_assignments():
    me = current_user()

    if request.method == 'POST':
        if request.content_type and 'multipart/form-data' in request.content_type:
            title        = request.form.get('title', '').strip()
            due_str      = request.form.get('due_date', '').strip()
            course_code  = request.form.get('course_code', '').strip()
            course_title = request.form.get('course_title', '').strip()
            description  = request.form.get('description', '').strip()
            file         = request.files.get('attachment')
        else:
            d = request.get_json() or {}
            title        = (d.get('title') or '').strip()
            due_str      = d.get('due_date')
            course_code  = (d.get('course_code') or '').strip()
            course_title = (d.get('course_title') or '').strip()
            description  = (d.get('description') or '').strip()
            file         = None

        if not title or not due_str or not course_code:
            return jsonify({'error': 'Title, course code and due date required'}), 400

        try:
            due_date = datetime.fromisoformat(due_str.replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid date'}), 400

        attachment_path = None
        attachment_name = None
        if file and file.filename:
            if not allowed_assignment_file(file.filename):
                return jsonify({'error': 'File type not allowed'}), 400
            attachment_name = file.filename
            attachment_path = save_upload(file, f'assign{me.id}')

        a = Assignment(
            user_id=me.id,
            course_code=course_code,
            course_title=course_title,
            title=title,
            description=description,
            due_date=due_date,
            attachment_path=attachment_path,
            attachment_name=attachment_name,
        )
        db.session.add(a)
        db.session.commit()
        return jsonify(serialize_assignment(a))

    q = Assignment.query.filter_by(user_id=me.id).order_by(Assignment.due_date.asc())
    return jsonify([serialize_assignment(a) for a in q.all()])


def serialize_assignment(a):
    now = datetime.utcnow()
    overdue = a.due_date < now and not a.completed
    days_left = (a.due_date - now).days
    if a.completed:
        urgency = 'done'
    elif overdue:
        urgency = 'overdue'
    elif days_left <= 1:
        urgency = 'urgent'
    elif days_left <= 3:
        urgency = 'soon'
    else:
        urgency = 'later'

    return {
        'id': a.id,
        'course_code': a.course_code,
        'course_title': a.course_title,
        'title': a.title,
        'description': a.description,
        'due_date': a.due_date.isoformat(),
        'due_label': a.due_date.strftime('%b %d, %I:%M %p'),
        'completed': a.completed,
        'urgency': urgency,
        'attachment_url': url_for('uploaded_file', filename=a.attachment_path) if a.attachment_path else None,
        'attachment_name': a.attachment_name,
        'has_image': bool(a.attachment_path and a.attachment_path.lower().rsplit('.', 1)[-1] in {'png', 'jpg', 'jpeg', 'webp'}),
    }


@app.route('/api/assignments/<int:aid>/toggle', methods=['POST'])
@verified_required
def api_assignment_toggle(aid):
    a = Assignment.query.get_or_404(aid)
    if a.user_id != current_user().id:
        abort(403)
    a.completed = not a.completed
    db.session.commit()
    return jsonify(serialize_assignment(a))


@app.route('/api/assignments/<int:aid>', methods=['DELETE'])
@verified_required
def api_assignment_delete(aid):
    a = Assignment.query.get_or_404(aid)
    if a.user_id != current_user().id:
        abort(403)
    if a.attachment_path:
        fp = os.path.join(app.config['UPLOAD_FOLDER'], a.attachment_path)
        if os.path.exists(fp):
            try: os.remove(fp)
            except OSError: pass
    db.session.delete(a)
    db.session.commit()
    return jsonify({'ok': True})


# ─────────────────────────────────────────────
# EVENTS / PARTIES
# ─────────────────────────────────────────────
@app.route('/parties')
@verified_required
def parties():
    return render_template('parties.html', user=current_user())


@app.route('/api/events', methods=['GET', 'POST'])
@verified_required
def api_events():
    me = current_user()
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        description = request.form.get('description', '').strip()
        venue = request.form.get('venue', '').strip()
        starts_str = request.form.get('starts_at', '').strip()
        image = request.files.get('image')

        if not title or not starts_str:
            return jsonify({'error': 'Title and start time required'}), 400

        try:
            starts_at = datetime.fromisoformat(starts_str.replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid date'}), 400

        image_path = None
        if image and image.filename and allowed_image(image.filename):
            image_path = save_upload(image, f'event{me.id}')

        e = Event(user_id=me.id, title=title, description=description,
                  venue=venue, starts_at=starts_at, image_path=image_path)
        db.session.add(e)
        db.session.commit()
        return jsonify(serialize_event(e, me.id))

    events = Event.query.order_by(Event.starts_at.asc()).limit(50).all()
    return jsonify([serialize_event(e, me.id) for e in events])


def serialize_event(e, me_id):
    going = any(r.user_id == me_id for r in e.rsvps)
    return {
        'id': e.id, 'title': e.title, 'description': e.description,
        'venue': e.venue,
        'starts_at': e.starts_at.isoformat(),
        'starts_label': e.starts_at.strftime('%a, %b %d · %I:%M %p'),
        'image': url_for('uploaded_file', filename=e.image_path) if e.image_path else None,
        'host': e.host.full_name, 'host_id': e.host.id,
        'rsvp_count': len(e.rsvps), 'going': going,
        'mine': e.user_id == me_id,
    }


@app.route('/api/events/<int:eid>/rsvp', methods=['POST'])
@verified_required
def api_event_rsvp(eid):
    me = current_user().id
    e = Event.query.get_or_404(eid)
    existing = EventRSVP.query.filter_by(event_id=eid, user_id=me).first()
    if existing:
        db.session.delete(existing); going = False
    else:
        db.session.add(EventRSVP(event_id=eid, user_id=me)); going = True
    db.session.commit()
    return jsonify({'going': going, 'rsvp_count': len(e.rsvps)})


# ─────────────────────────────────────────────
# CHAT
# ─────────────────────────────────────────────
@app.route('/chat')
@verified_required
def chat():
    return render_template('chat.html', user=current_user())


def dm_key_for(a, b):
    return '-'.join(map(str, sorted([a, b])))


def serialize_room_for(r, me):
    last_msg = r.messages[-1] if r.messages else None

    if r.is_group:
        display_name = r.name
        avatar = None
        other_user_id = None
    else:
        other = next((m.user for m in r.members if m.user_id != me.id), None)
        display_name = other.full_name if other else 'Unknown'
        avatar = user_avatar(other) if other else None
        other_user_id = other.id if other else None

    return {
        'id': r.id,
        'name': display_name,
        'avatar': avatar,
        'is_group': r.is_group,
        'other_user_id': other_user_id,
        'last_message': last_msg.content if last_msg else '',
        'last_time': time_ago(last_msg.created_at) if last_msg else '',
        'member_count': len(r.members),
    }


@app.route('/api/chat/rooms', methods=['GET'])
@verified_required
def api_chat_rooms_list():
    me = current_user()
    rooms = (ChatRoom.query
             .join(ChatMember)
             .filter(ChatMember.user_id == me.id)
             .all())
    rooms_data = [serialize_room_for(r, me) for r in rooms]
    rooms_data.sort(key=lambda r: r['last_time'], reverse=True)
    return jsonify(rooms_data)


@app.route('/api/chat/group', methods=['POST'])
@verified_required
def api_chat_group_create():
    me = current_user()
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    member_ids = d.get('member_ids') or []

    if not name:
        return jsonify({'error': 'Name required'}), 400
    if len(member_ids) < 2:
        return jsonify({'error': 'Group needs at least 2 other members'}), 400

    room = ChatRoom(name=name, is_group=True)
    db.session.add(room)
    db.session.flush()

    all_ids = set(member_ids) | {me.id}
    for uid in all_ids:
        if User.query.get(uid):
            db.session.add(ChatMember(room_id=room.id, user_id=uid))
    db.session.commit()
    return jsonify({'id': room.id, 'name': room.name, 'is_group': True})


@app.route('/api/chat/dm/<int:user_id>', methods=['POST'])
@verified_required
def api_chat_dm_open(user_id):
    me = current_user().id
    if user_id == me:
        return jsonify({'error': 'Cannot DM yourself'}), 400

    target = User.query.get_or_404(user_id)
    if target.verification_status != 'verified':
        return jsonify({'error': 'User not verified'}), 403

    key = dm_key_for(me, user_id)

    existing = ChatRoom.query.filter_by(dm_key=key).first()
    if existing:
        return jsonify({
            'id': existing.id,
            'name': target.full_name,
            'avatar': user_avatar(target),
            'is_group': False,
            'other_user_id': target.id,
        })

    room = ChatRoom(name=target.full_name, is_group=False, dm_key=key)
    db.session.add(room)
    db.session.flush()

    db.session.add(ChatMember(room_id=room.id, user_id=me))
    db.session.add(ChatMember(room_id=room.id, user_id=user_id))
    db.session.commit()

    return jsonify({
        'id': room.id,
        'name': target.full_name,
        'avatar': user_avatar(target),
        'is_group': False,
        'other_user_id': target.id,
    })


@app.route('/api/chat/rooms/<int:rid>/messages')
@verified_required
def api_chat_messages(rid):
    me = current_user().id
    membership = ChatMember.query.filter_by(room_id=rid, user_id=me).first()
    if not membership:
        abort(403)
    room = ChatRoom.query.get_or_404(rid)
    return jsonify([{
        'id': m.id, 'content': m.content, 'user_id': m.user_id,
        'author': m.user.full_name,
        'avatar': user_avatar(m.user),
        'mine': m.user_id == me,
        'time': m.created_at.strftime('%I:%M %p'),
    } for m in room.messages])


# ─────────────────────────────────────────────
# USER SEARCH
# ─────────────────────────────────────────────
@app.route('/api/users/search')
@verified_required
def api_users_search():
    me = current_user().id
    q = (request.args.get('q') or '').strip().lower()

    if not q:
        return jsonify([])

    candidates = User.query.filter(
        User.id != me,
        User.role != 'admin',
        User.verification_status == 'verified',
    ).limit(500).all()

    def matches(u):
        name = (u.full_name or '').lower()
        email = (u.email or '').lower()
        if q in name: return True
        if any(w.startswith(q) for w in name.split()): return True
        if q in email: return True
        local = email.split('@')[0] if '@' in email else ''
        if local and local.startswith(q): return True
        return False

    matched = [u for u in candidates if matches(u)][:20]

    result = []
    for u in matched:
        key = dm_key_for(me, u.id)
        existing = ChatRoom.query.filter_by(dm_key=key).first()
        result.append({
            'id': u.id,
            'name': u.full_name,
            'email': u.email,
            'avatar': user_avatar(u),
            'existing_room_id': existing.id if existing else None,
        })
    return jsonify(result)


@app.route('/api/users')
@verified_required
def api_users():
    me = current_user().id
    users = User.query.filter(User.id != me, User.verification_status == 'verified')\
        .limit(200).all()
    return jsonify([{
        'id': u.id, 'name': u.full_name, 'email': u.email,
        'avatar': user_avatar(u),
    } for u in users])


# ─────────────────────────────────────────────
# PROFILE
# ─────────────────────────────────────────────
@app.route('/me')
@verified_required
def me():
    u = current_user()
    v = StudentVerification.query.filter_by(user_id=u.id).first()
    post_count = Post.query.filter_by(user_id=u.id).count()
    listing_count = Listing.query.filter_by(user_id=u.id).count()
    connection_count = Connection.query.filter(
        Connection.status == 'accepted',
        db.or_(Connection.requester_id == u.id, Connection.recipient_id == u.id)
    ).count()
    return render_template('me.html', user=u, verification=v,
                           post_count=post_count, listing_count=listing_count,
                           connection_count=connection_count,
                           avatar=user_avatar(u))


@app.route('/api/me', methods=['PATCH'])
@verified_required
def api_me_update():
    u = current_user()
    d = request.get_json() or {}
    if 'full_name' in d and d['full_name'].strip():
        u.full_name = d['full_name'].strip()[:120]
    if 'bio' in d:
        u.bio = (d['bio'] or '')[:200]
    db.session.commit()
    return jsonify({'ok': True, 'full_name': u.full_name, 'bio': u.bio})


@app.route('/api/me/posts')
@verified_required
def api_my_posts():
    me = current_user()
    posts = Post.query.filter_by(user_id=me.id).order_by(Post.created_at.desc()).limit(50).all()
    return jsonify([serialize_post(p, me.id) for p in posts])


@app.route('/api/me/picture', methods=['POST'])
@verified_required
def api_me_picture():
    u = current_user()
    file = request.files.get('picture')
    if not file or not file.filename:
        return jsonify({'error': 'No file'}), 400
    if not allowed_image(file.filename):
        return jsonify({'error': 'Only PNG, JPG, JPEG, WEBP allowed'}), 400

    if u.profile_picture_path:
        old = os.path.join(app.config['UPLOAD_FOLDER'], u.profile_picture_path)
        if os.path.exists(old):
            try: os.remove(old)
            except OSError: pass

    filename = save_upload(file, f'avatar{u.id}')
    u.profile_picture_path = filename
    db.session.commit()
    return jsonify({'ok': True, 'avatar': user_avatar(u)})


@app.route('/api/me/picture', methods=['DELETE'])
@verified_required
def api_me_picture_delete():
    u = current_user()
    if u.profile_picture_path:
        old = os.path.join(app.config['UPLOAD_FOLDER'], u.profile_picture_path)
        if os.path.exists(old):
            try: os.remove(old)
            except OSError: pass
        u.profile_picture_path = None
        db.session.commit()
    return jsonify({'ok': True})


# ─────────────────────────────────────────────
# CONNECT (Add Up)
# ─────────────────────────────────────────────
@app.route('/connect')
@verified_required
def connect():
    return render_template('connect.html', user=current_user())


def serialize_connection_user(u, connection_status=None, connection_id=None):
    return {
        'id': u.id,
        'name': u.full_name,
        'avatar': user_avatar(u),
        'bio': u.bio or '',
        'department': u.verification.department if u.verification else '',
        'faculty': u.verification.faculty if u.verification else '',
        'level': u.verification.level if u.verification else '',
        'status': connection_status,
        'connection_id': connection_id,
    }


@app.route('/api/connect/suggestions')
@verified_required
def api_connect_suggestions():
    me = current_user()

    existing = Connection.query.filter(
        db.or_(Connection.requester_id == me.id, Connection.recipient_id == me.id)
    ).all()
    excluded_ids = {me.id}
    for c in existing:
        excluded_ids.add(c.requester_id)
        excluded_ids.add(c.recipient_id)

    my_dept = me.verification.department if me.verification else None
    my_faculty = me.verification.faculty if me.verification else None

    candidates = User.query.filter(
        User.id.notin_(excluded_ids),
        User.verification_status == 'verified',
        User.role != 'admin',
    ).limit(100).all()

    def score(u):
        if my_dept and u.verification and u.verification.department == my_dept:
            return 0
        if my_faculty and u.verification and u.verification.faculty == my_faculty:
            return 1
        return 2

    candidates.sort(key=score)
    return jsonify([serialize_connection_user(u) for u in candidates[:50]])


@app.route('/api/connect/requests')
@verified_required
def api_connect_requests():
    me = current_user().id

    incoming = Connection.query.filter_by(recipient_id=me, status='pending').all()
    outgoing = Connection.query.filter_by(requester_id=me, status='pending').all()

    return jsonify({
        'incoming': [
            serialize_connection_user(c.requester, 'incoming', c.id)
            for c in incoming
        ],
        'outgoing': [
            serialize_connection_user(c.recipient, 'outgoing', c.id)
            for c in outgoing
        ],
    })


@app.route('/api/connect/send/<int:user_id>', methods=['POST'])
@verified_required
def api_connect_send(user_id):
    me = current_user().id
    if user_id == me:
        return jsonify({'error': 'Cannot connect to yourself'}), 400

    target = User.query.get_or_404(user_id)

    reverse = Connection.query.filter_by(
        requester_id=user_id, recipient_id=me, status='pending'
    ).first()
    if reverse:
        reverse.status = 'accepted'
        db.session.commit()
        return jsonify({'ok': True, 'status': 'accepted', 'connection_id': reverse.id})

    existing = Connection.query.filter(
        db.or_(
            db.and_(Connection.requester_id == me, Connection.recipient_id == user_id),
            db.and_(Connection.requester_id == user_id, Connection.recipient_id == me),
        )
    ).first()

    if existing:
        return jsonify({'ok': True, 'status': existing.status, 'connection_id': existing.id})

    conn = Connection(requester_id=me, recipient_id=user_id, status='pending')
    db.session.add(conn)
    db.session.commit()
    return jsonify({'ok': True, 'status': 'pending', 'connection_id': conn.id})


@app.route('/api/connect/accept/<int:cid>', methods=['POST'])
@verified_required
def api_connect_accept(cid):
    me = current_user().id
    c = Connection.query.get_or_404(cid)
    if c.recipient_id != me:
        abort(403)
    c.status = 'accepted'
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/connect/decline/<int:cid>', methods=['POST'])
@verified_required
def api_connect_decline(cid):
    me = current_user().id
    c = Connection.query.get_or_404(cid)
    if c.recipient_id != me:
        abort(403)
    db.session.delete(c)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/connect/mine')
@verified_required
def api_connect_mine():
    me = current_user().id
    accepted = Connection.query.filter(
        Connection.status == 'accepted',
        db.or_(Connection.requester_id == me, Connection.recipient_id == me)
    ).all()

    result = []
    for c in accepted:
        other = c.recipient if c.requester_id == me else c.requester
        result.append(serialize_connection_user(other, 'connected', c.id))
    return jsonify(result)


# ─────────────────────────────────────────────
# FOLLOW
# ─────────────────────────────────────────────
@app.route('/api/users/<int:uid>/follow', methods=['POST'])
@verified_required
def api_follow(uid):
    me = current_user().id
    if uid == me:
        return jsonify({'error': 'Cannot follow yourself'}), 400
    target = User.query.get_or_404(uid)
    existing = Follow.query.filter_by(follower_id=me, following_id=uid).first()
    if not existing:
        db.session.add(Follow(follower_id=me, following_id=uid))
        db.session.commit()
    return jsonify({
        'following': True,
        'followers': Follow.query.filter_by(following_id=uid).count(),
    })


@app.route('/api/users/<int:uid>/follow', methods=['DELETE'])
@verified_required
def api_unfollow(uid):
    me = current_user().id
    existing = Follow.query.filter_by(follower_id=me, following_id=uid).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify({
        'following': False,
        'followers': Follow.query.filter_by(following_id=uid).count(),
    })


@app.route('/api/users/<int:uid>/follow-status')
@verified_required
def api_follow_status(uid):
    me = current_user().id
    following = bool(Follow.query.filter_by(follower_id=me, following_id=uid).first())
    return jsonify({
        'following': following,
        'followers': Follow.query.filter_by(following_id=uid).count(),
        'following_count': Follow.query.filter_by(follower_id=uid).count(),
    })


# ─────────────────────────────────────────────
# PUBLIC USER PROFILE
# ─────────────────────────────────────────────
@app.route('/user/<int:uid>')
@verified_required
def user_profile(uid):
    me = current_user()
    target = User.query.get_or_404(uid)

    if target.id == me.id:
        return redirect(url_for('me'))

    if target.verification_status != 'verified' and target.role != 'admin':
        abort(404)

    db.session.add(ProfileView(viewer_id=me.id, viewed_id=uid))
    db.session.commit()

    v = StudentVerification.query.filter_by(user_id=uid).first()
    post_count = Post.query.filter_by(user_id=uid, anonymous=False).count()
    follower_count = Follow.query.filter_by(following_id=uid).count()
    following_count = Follow.query.filter_by(follower_id=uid).count()
    is_following = bool(Follow.query.filter_by(follower_id=me.id, following_id=uid).first())

    public_info = {
        'department': v.department if v else '',
        'faculty':    v.faculty    if v else '',
        'level':      v.level      if v else '',
    }

    return render_template('user.html',
                           user=target,
                           public_info=public_info,
                           post_count=post_count,
                           follower_count=follower_count,
                           following_count=following_count,
                           is_following=is_following,
                           avatar=user_avatar(target))


@app.route('/api/user/<int:uid>/posts')
@verified_required
def api_user_posts(uid):
    me = current_user().id
    posts = Post.query.filter_by(user_id=uid, anonymous=False)\
        .order_by(Post.created_at.desc()).limit(50).all()
    return jsonify([serialize_post(p, me) for p in posts])


# ─────────────────────────────────────────────
# FOLLOWERS / FOLLOWING (my own)
# ─────────────────────────────────────────────
@app.route('/api/me/following')
@verified_required
def api_me_following():
    me = current_user().id
    rows = Connection.query.filter_by(requester_id=me, status='accepted').all()
    result = [serialize_connection_user(c.recipient, 'following', c.id) for c in rows]
    return jsonify(result)


@app.route('/api/me/followers')
@verified_required
def api_me_followers():
    me = current_user().id
    rows = Connection.query.filter_by(recipient_id=me, status='accepted').all()
    result = [serialize_connection_user(c.requester, 'follower', c.id) for c in rows]
    return jsonify(result)


# ─────────────────────────────────────────────
# ADMIN — SECRET URL + UNLOCK
# ─────────────────────────────────────────────

@app.route('/admin-unlock', methods=['GET', 'POST'])
@login_required
def admin_unlock():
    u = current_user()
    if not u or u.role != 'admin':
        abort(404)

    if request.method == 'POST':
        key = request.form.get('admin_key', '').strip()
        if key == app.config['ADMIN_KEY']:
            session['admin_unlocked'] = True
            touch_admin_session()
            flash('Admin unlocked', 'success')
            return redirect(url_for('admin'))
        flash('Invalid admin key', 'error')

    return render_template('admin_unlock.html')


def admin_view():
    """The admin dashboard. Registered at the secret path."""
    u = current_user()
    if not u:
        return redirect(url_for('login'))
    if u.role != 'admin':
        abort(404)

    # Require unlock
    if not session.get('admin_unlocked'):
        return redirect(url_for('admin_unlock'))

    # Session timeout
    if admin_session_expired():
        session.pop('admin_unlocked', None)
        session.pop('admin_last_seen', None)
        flash('Admin session expired. Please unlock again.', 'error')
        return redirect(url_for('admin_unlock'))

    touch_admin_session()

    pending = StudentVerification.query.filter_by(status='pending')\
        .order_by(StudentVerification.submitted_at.asc()).all()
    recent = StudentVerification.query.filter(StudentVerification.status != 'pending')\
        .order_by(StudentVerification.reviewed_at.desc()).limit(20).all()
    return render_template('admin.html', pending=pending, recent=recent)


# Register the admin dashboard at the secret path
app.add_url_rule(app.config['ADMIN_PATH'], 'admin', admin_view)


@app.route(app.config['ADMIN_PATH'] + '/lock')
def admin_lock():
    session.pop('admin_unlocked', None)
    session.pop('admin_last_seen', None)
    flash('Admin locked', 'success')
    return redirect(url_for('home'))


@app.route(app.config['ADMIN_PATH'] + '/approve/<int:vid>', methods=['POST'])
def admin_approve(vid):
    u = current_user()
    if not u or u.role != 'admin':
        abort(404)
    if not is_admin_unlocked():
        return redirect(url_for('admin_unlock'))
    touch_admin_session()

    v = StudentVerification.query.get_or_404(vid)
    v.status = 'approved'
    v.reviewed_at = datetime.utcnow()
    v.reviewed_by = u.id
    v.user.verification_status = 'verified'
    db.session.commit()

    log_admin_action('approve', target_user_id=v.user_id, detail=v.matric_no)
    flash(f'{v.user.full_name} approved', 'success')
    return redirect(url_for('admin'))


@app.route(app.config['ADMIN_PATH'] + '/reject/<int:vid>', methods=['POST'])
def admin_reject(vid):
    u = current_user()
    if not u or u.role != 'admin':
        abort(404)
    if not is_admin_unlocked():
        return redirect(url_for('admin_unlock'))
    touch_admin_session()

    reason = request.form.get('reason', '').strip() or 'Document could not be verified'
    v = StudentVerification.query.get_or_404(vid)
    v.status = 'rejected'
    v.rejection_reason = reason
    v.reviewed_at = datetime.utcnow()
    v.reviewed_by = u.id
    v.user.verification_status = 'rejected'
    db.session.commit()

    log_admin_action('reject', target_user_id=v.user_id, detail=reason)
    flash(f'{v.user.full_name} rejected', 'success')
    return redirect(url_for('admin'))


@app.route(app.config['ADMIN_PATH'] + '/log')
def admin_log_view():
    u = current_user()
    if not u or u.role != 'admin':
        abort(404)
    if not is_admin_unlocked():
        return redirect(url_for('admin_unlock'))
    touch_admin_session()

    logs = AdminAction.query.order_by(AdminAction.created_at.desc()).limit(200).all()
    return render_template('admin_log.html', logs=logs)


# ─────────────────────────────────────────────
# WEBSOCKET — Chat
# ─────────────────────────────────────────────
@socketio.on('join')
def ws_join(data):
    rid = data.get('room_id')
    if not rid: return
    u = current_user()
    if not u: return
    if not ChatMember.query.filter_by(room_id=rid, user_id=u.id).first():
        return
    join_room(f'room_{rid}')


@socketio.on('leave')
def ws_leave(data):
    rid = data.get('room_id')
    if rid:
        leave_room(f'room_{rid}')


@socketio.on('message')
def ws_message(data):
    rid = data.get('room_id')
    content = (data.get('content') or '').strip()
    u = current_user()
    if not rid or not content or not u:
        return
    if not ChatMember.query.filter_by(room_id=rid, user_id=u.id).first():
        return

    msg = ChatMessage(room_id=rid, user_id=u.id, content=content[:2000])
    db.session.add(msg)
    db.session.commit()

    payload = {
        'id': msg.id, 'content': msg.content, 'user_id': u.id,
        'author': u.full_name,
        'avatar': user_avatar(u),
        'time': msg.created_at.strftime('%I:%M %p'),
    }
    emit('message', payload, to=f'room_{rid}')


# ─────────────────────────────────────────────
# DEBUG
# ─────────────────────────────────────────────
@app.route('/api/debug/users')
@verified_required
def api_debug_users():
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'name': u.full_name,
        'email': u.email,
        'role': u.role,
        'status': u.verification_status,
        'has_picture': bool(u.profile_picture_path),
    } for u in users])


# ─────────────────────────────────────────────
# INIT
# ─────────────────────────────────────────────
with app.app_context():
    db.create_all()

    admin_email = os.environ.get('ADMIN_EMAIL', 'oladipobright12@gmail.com')
    admin_pass  = os.environ.get('ADMIN_PASSWORD', 'bright_kelvin*$')

    if not User.query.filter_by(email=admin_email).first():
        # Check if an admin already exists with a different email
        existing_admin = User.query.filter_by(role='admin').first()
        if existing_admin:
            existing_admin.email = admin_email
            existing_admin.password_hash = generate_password_hash(admin_pass)
            db.session.commit()
            print(f'✓ Admin credentials updated: {admin_email}')
        else:
            db.session.add(User(
                full_name='FUNDAR Admin',
                email=admin_email,
                phone='',
                password_hash=generate_password_hash(admin_pass),
                role='admin',
                verification_status='verified',
                avatar_seed='admin'
            ))
            db.session.commit()
            print(f'✓ Admin created: {admin_email}')


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'

    print('=' * 60)
    print(f'  ADMIN URL : {app.config["ADMIN_PATH"]}')
    print(f'  ADMIN KEY : {app.config["ADMIN_KEY"]}')
    print(f'  ADMIN SESSION TIMEOUT: {app.config["ADMIN_SESSION_MINUTES"]} min')
    print('=' * 60)

    if debug:
        socketio.run(app, debug=True, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
    else:
        socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)