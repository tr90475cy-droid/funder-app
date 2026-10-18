from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20))
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='student')
    verification_status = db.Column(db.String(20), default='unverified')
    bio = db.Column(db.String(200))
    avatar_seed = db.Column(db.String(40))
    profile_picture_path = db.Column(db.String(255))
    subaccount_code = db.Column(db.String(50), index=True)
    paystack_recipient_code = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    verification = db.relationship('StudentVerification', backref='user', uselist=False,
                                   foreign_keys='StudentVerification.user_id',
                                   cascade='all, delete-orphan')
    posts = db.relationship('Post', backref='author', cascade='all, delete-orphan')


class StudentVerification(db.Model):
    __tablename__ = 'student_verifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    matric_no = db.Column(db.String(50), nullable=False, index=True)
    faculty = db.Column(db.String(120), nullable=False)
    department = db.Column(db.String(120), nullable=False)
    level = db.Column(db.String(10), nullable=False)
    admission_year = db.Column(db.String(10), nullable=False)
    admission_letter_path = db.Column(db.String(255))
    status = db.Column(db.String(20), default='pending')
    rejection_reason = db.Column(db.Text)
    ai_score = db.Column(db.Float)
    ai_flags = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_at = db.Column(db.DateTime)
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'))


class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    image_path = db.Column(db.String(255))
    anonymous = db.Column(db.Boolean, default=False)
    tag = db.Column(db.String(30), default='gist')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    likes = db.relationship('Like', backref='post', cascade='all, delete-orphan')
    comments = db.relationship('Comment', backref='post', cascade='all, delete-orphan',
                               order_by='Comment.created_at')


class Like(db.Model):
    __tablename__ = 'likes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'post_id', name='uq_user_post_like'),)


class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    anonymous = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])


class ChatRoom(db.Model):
    __tablename__ = 'chat_rooms'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    is_group = db.Column(db.Boolean, default=True)
    dm_key = db.Column(db.String(50), unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    messages = db.relationship('ChatMessage', backref='room', cascade='all, delete-orphan',
                               order_by='ChatMessage.created_at')
    members = db.relationship('ChatMember', backref='room', cascade='all, delete-orphan')


class ChatMember(db.Model):
    __tablename__ = 'chat_members'
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('chat_rooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('room_id', 'user_id', name='uq_room_user'),)

    user = db.relationship('User')


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('chat_rooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User')


class Listing(db.Model):
    __tablename__ = 'listings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(40), default='other')
    image_path = db.Column(db.String(255))
    sold = db.Column(db.Boolean, default=False)

    # Ad promotion fields
    featured = db.Column(db.Boolean, default=False, index=True)
    featured_until = db.Column(db.DateTime, index=True)
    featured_days = db.Column(db.Integer, default=0)
    featured_amount_paid = db.Column(db.Float, default=0)
    featured_last_payment_ref = db.Column(db.String(100))

    # Sale tracking
    sold_at = db.Column(db.DateTime)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    payment_reference = db.Column(db.String(100), index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    seller = db.relationship('User', foreign_keys=[user_id])
    buyer = db.relationship('User', foreign_keys=[buyer_id])


class Assignment(db.Model):
    __tablename__ = 'assignments'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_code = db.Column(db.String(20), nullable=False)
    course_title = db.Column(db.String(120))
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    due_date = db.Column(db.DateTime, nullable=False)
    completed = db.Column(db.Boolean, default=False)
    attachment_path = db.Column(db.String(255))
    attachment_name = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User')


class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    venue = db.Column(db.String(200))
    starts_at = db.Column(db.DateTime, nullable=False)
    image_path = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    host = db.relationship('User')
    rsvps = db.relationship('EventRSVP', backref='event', cascade='all, delete-orphan')


class EventRSVP(db.Model):
    __tablename__ = 'event_rsvps'
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('event_id', 'user_id', name='uq_event_user'),)


class Connection(db.Model):
    __tablename__ = 'connections'
    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    requester = db.relationship('User', foreign_keys=[requester_id])
    recipient = db.relationship('User', foreign_keys=[recipient_id])

    __table_args__ = (db.UniqueConstraint('requester_id', 'recipient_id', name='uq_connection_pair'),)


class Follow(db.Model):
    __tablename__ = 'follows'
    id = db.Column(db.Integer, primary_key=True)
    follower_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    following_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('follower_id', 'following_id', name='uq_follow_pair'),)

    follower = db.relationship('User', foreign_keys=[follower_id])
    following = db.relationship('User', foreign_keys=[following_id])


class ProfileView(db.Model):
    __tablename__ = 'profile_views'
    id = db.Column(db.Integer, primary_key=True)
    viewer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    viewed_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class AdminAction(db.Model):
    __tablename__ = 'admin_actions'
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    target_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    target_detail = db.Column(db.String(255))
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    admin = db.relationship('User', foreign_keys=[admin_id])