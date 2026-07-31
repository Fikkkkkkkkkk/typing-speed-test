import os
from flask import Flask
from dotenv import load_dotenv
from sqlalchemy import text
from app.extensions import db, login_manager

load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Configure application parameters
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'typing-speed-test-dev-secret-key-98765')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///typing_test.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize extensions with app instance
    db.init_app(app)
    
    # Login Configuration
    login_manager.login_view = 'auth.login'  # Points to Blueprint route
    login_manager.login_message_category = 'info'
    login_manager.init_app(app)
    
    # Register user loader callback
    from app.models import User
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
        
    # Import and register blueprints
    from app.auth import auth_bp
    from app.main import main_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    
    # Ensure tables are created inside application context
    with app.app_context():
        db.create_all()
        # SQLite migration to add started_tests column if not exists
        try:
            db.session.execute(text('ALTER TABLE users ADD COLUMN started_tests INTEGER DEFAULT 0'))
            db.session.commit()
        except Exception:
            db.session.rollback()
        
    return app
