import os
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, TestResult
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'typing-speed-test-dev-secret-key-98765')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///typing_test.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize DB
db.init_app(app)

# Initialize Login Manager
login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Routes ---

# Home page / Typing Test
@app.route('/')
def index():
    return render_template('index.html')

# User Registration
@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        
        if not username or not email or not password:
            flash('All fields are required.', 'error')
            return render_template('register.html')
            
        # Check existing user
        if User.query.filter_by(username=username).first():
            flash('Username is already taken.', 'error')
            return render_template('register.html')
            
        if User.query.filter_by(email=email).first():
            flash('Email is already registered.', 'error')
            return render_template('register.html')
            
        # Create user
        new_user = User(username=username, email=email)
        new_user.set_password(password)
        
        db.session.add(new_user)
        db.session.commit()
        
        flash('Account created successfully! You can now log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('register.html')

# User Login
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        email_or_username = request.form.get('login_identifier', '').strip()
        password = request.form.get('password', '')
        remember = True if request.form.get('remember') else False
        
        if not email_or_username or not password:
            flash('Please fill in all fields.', 'error')
            return render_template('login.html')
            
        # Find user by username or email
        user = User.query.filter(
            (User.email == email_or_username) | (User.username == email_or_username)
        ).first()
        
        if user and user.check_password(password):
            login_user(user, remember=remember)
            flash(f'Welcome back, {user.username}!', 'success')
            next_page = request.args.get('next')
            return redirect(next_page if next_page else url_for('index'))
        else:
            flash('Login failed. Please check your username/email and password.', 'error')
            
    return render_template('login.html')

# User Logout
@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('index'))

# User Dashboard / Statistics
@app.route('/dashboard')
@login_required
def dashboard():
    # Fetch user's tests
    results = TestResult.query.filter_by(user_id=current_user.id).order_by(TestResult.timestamp.desc()).all()
    
    # Calculate stats
    total_tests = len(results)
    avg_wpm = sum(r.wpm for r in results) / total_tests if total_tests > 0 else 0
    avg_accuracy = sum(r.accuracy for r in results) / total_tests if total_tests > 0 else 0
    
    # Personal bests
    pb_wpm = db.session.query(db.func.max(TestResult.wpm)).filter_by(user_id=current_user.id).scalar() or 0
    pb_accuracy = db.session.query(db.func.max(TestResult.accuracy)).filter_by(user_id=current_user.id).scalar() or 0
    
    return render_template(
        'dashboard.html', 
        results=results, 
        total_tests=total_tests,
        avg_wpm=round(avg_wpm, 1),
        avg_accuracy=round(avg_accuracy, 1),
        pb_wpm=round(pb_wpm, 1),
        pb_accuracy=round(pb_accuracy, 1)
    )

# --- APIs ---

# Fetch random words
@app.route('/api/words')
def get_words():
    count = request.args.get('count', default=50, type=int)
    # Ensure count doesn't exceed reasonable limits
    count = min(count, 300)
    
    try:
        words_file_path = os.path.join(app.root_path, 'static', 'data', 'words.json')
        with open(words_file_path, 'r') as f:
            data = json.load(f)
            words_pool = data.get('english_200', [])
    except Exception as e:
        # Fallback if file load fails
        words_pool = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with"]
        
    # Duplicate and shuffle to fill the requested count
    import random
    selected = []
    for _ in range(count):
        selected.append(random.choice(words_pool))
        
    return jsonify(selected)

# Save test results
@app.route('/api/test/save', methods=['POST'])
def save_test():
    if not current_user.is_authenticated:
        return jsonify({'status': 'guest_mode', 'message': 'Result not saved to db. Log in to track progress!'}), 200
        
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Invalid data'}), 400
        
    wpm = data.get('wpm')
    accuracy = data.get('accuracy')
    duration = data.get('duration')
    mode = data.get('mode', 'time')
    
    if wpm is None or accuracy is None or duration is None:
        return jsonify({'status': 'error', 'message': 'Missing fields'}), 400
        
    try:
        new_result = TestResult(
            user_id=current_user.id,
            wpm=float(wpm),
            accuracy=float(accuracy),
            duration=int(duration),
            mode=str(mode)
        )
        db.session.add(new_result)
        db.session.commit()
        return jsonify({'status': 'success', 'message': 'Result saved successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Get test history for charts
@app.route('/api/test/history')
@login_required
def test_history():
    results = TestResult.query.filter_by(user_id=current_user.id).order_by(TestResult.timestamp.asc()).all()
    history_data = [
        {
            'wpm': r.wpm,
            'accuracy': r.accuracy,
            'timestamp': r.timestamp.strftime('%Y-%m-%d %H:%M')
        } for r in results
    ]
    return jsonify(history_data)

# Create database tables at startup
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
