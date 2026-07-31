import os
import json
import random
from flask import render_template, request, jsonify, current_app, redirect, url_for, flash
from flask_login import login_required, current_user, logout_user
from app.extensions import db
from app.models import User, TestResult
from app.main import main_bp

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/dashboard')
@login_required
def dashboard():
    results = TestResult.query.filter_by(user_id=current_user.id).order_by(TestResult.timestamp.desc()).all()
    
    total_tests = len(results)
    avg_wpm = sum(r.wpm for r in results) / total_tests if total_tests > 0 else 0
    avg_accuracy = sum(r.accuracy for r in results) / total_tests if total_tests > 0 else 0
    
    pb_wpm = db.session.query(db.func.max(TestResult.wpm)).filter_by(user_id=current_user.id).scalar() or 0
    pb_accuracy = db.session.query(db.func.max(TestResult.accuracy)).filter_by(user_id=current_user.id).scalar() or 0
    
    # Calculate additional user statistics
    test_completed = total_tests
    test_started = max(current_user.started_tests, test_completed)
    
    total_seconds = sum(r.duration for r in results)
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    test_time_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"
    
    return render_template(
        'dashboard.html', 
        results=results, 
        total_tests=total_tests,
        avg_wpm=round(avg_wpm, 1),
        avg_accuracy=round(avg_accuracy, 1),
        pb_wpm=round(pb_wpm, 1),
        pb_accuracy=round(pb_accuracy, 1),
        test_started=test_started,
        test_completed=test_completed,
        test_time=test_time_str
    )

@main_bp.route('/api/words')
def get_words():
    count = request.args.get('count', default=50, type=int)
    count = min(count, 300)
    
    try:
        # Load from the app package root_path
        words_file_path = os.path.join(current_app.root_path, 'static', 'data', 'words.json')
        with open(words_file_path, 'r') as f:
            data = json.load(f)
            words_pool = data.get('english_200', [])
    except Exception as e:
        words_pool = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with"]
        
    selected = []
    for _ in range(count):
        selected.append(random.choice(words_pool))
        
    return jsonify(selected)

@main_bp.route('/api/test/start', methods=['POST'])
def start_test_api():
    if current_user.is_authenticated:
        current_user.started_tests += 1
        db.session.commit()
    return jsonify({'status': 'success'})

@main_bp.route('/api/test/save', methods=['POST'])
def save_test():
    if not current_user.is_authenticated:
        return jsonify({'status': 'guest_mode', 'message': 'Result not saved. Log in to track progress!'}), 200
        
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

@main_bp.route('/api/test/history')
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

@main_bp.route('/settings')
def settings():
    return render_template('pagepreferrences.html')

@main_bp.route('/profile')
@login_required
def profile():
    return render_template('accountsetting.html')

@main_bp.route('/profile/update', methods=['POST'])
@login_required
def update_profile():
    username = request.form.get('username', '').strip()
    email = request.form.get('email', '').strip()
    
    if 'username' not in request.form and 'email' not in request.form:
        return jsonify({'status': 'error', 'message': 'No profile fields were submitted.'}), 400
        
    has_updated = False
    
    if 'username' in request.form:
        if not username:
            return jsonify({'status': 'error', 'message': 'Username cannot be empty.'}), 400
        existing_username = User.query.filter(User.username == username, User.id != current_user.id).first()
        if existing_username:
            return jsonify({'status': 'error', 'message': 'Username is already taken.'}), 400
        current_user.username = username
        has_updated = True
        
    if 'email' in request.form:
        if not email:
            return jsonify({'status': 'error', 'message': 'Email address cannot be empty.'}), 400
        existing_email = User.query.filter(User.email == email, User.id != current_user.id).first()
        if existing_email:
            return jsonify({'status': 'error', 'message': 'Email is already registered.'}), 400
        current_user.email = email
        has_updated = True
        
    if has_updated:
        try:
            db.session.commit()
            return jsonify({'status': 'success', 'message': 'Profile details updated successfully!', 'username': current_user.username, 'email': current_user.email})
        except Exception as e:
            db.session.rollback()
            return jsonify({'status': 'error', 'message': f'An error occurred: {str(e)}'}), 500
            
    return jsonify({'status': 'error', 'message': 'No changes were made.'}), 400

@main_bp.route('/profile/password', methods=['POST'])
@login_required
def change_password():
    current_password = request.form.get('current_password', '')
    new_password = request.form.get('new_password', '')
    confirm_password = request.form.get('confirm_password', '')
    
    if not current_password or not new_password or not confirm_password:
        return jsonify({'status': 'error', 'message': 'All password fields are required.'}), 400
        
    if not current_user.check_password(current_password):
        return jsonify({'status': 'error', 'message': 'Current password is incorrect.'}), 400
        
    if new_password != confirm_password:
        return jsonify({'status': 'error', 'message': 'New passwords do not match.'}), 400
        
    try:
        current_user.set_password(new_password)
        db.session.commit()
        return jsonify({'status': 'success', 'message': 'Password updated successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': f'An error occurred: {str(e)}'}), 500

@main_bp.route('/profile/clear-history', methods=['POST'])
@login_required
def clear_history():
    try:
        TestResult.query.filter_by(user_id=current_user.id).delete()
        current_user.started_tests = 0
        db.session.commit()
        return jsonify({'status': 'success', 'message': 'Typing stats history cleared successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': f'An error occurred: {str(e)}'}), 500

@main_bp.route('/profile/delete-account', methods=['POST'])
@login_required
def delete_account():
    try:
        user = User.query.get(current_user.id)
        if user.avatar:
            upload_folder = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars')
            old_path = os.path.join(upload_folder, user.avatar)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
        logout_user()
        db.session.delete(user)
        db.session.commit()
        return jsonify({'status': 'success', 'message': 'Your account and history have been permanently deleted.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': f'An error occurred: {str(e)}'}), 500

# Helper function to check allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@main_bp.route('/profile/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part in the upload request.'}), 400
        
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No file was selected.'}), 400
        
    if file and allowed_file(file.filename):
        import time
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"user_{current_user.id}_{int(time.time())}.{ext}"
        
        upload_folder = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars')
        os.makedirs(upload_folder, exist_ok=True)
        
        if current_user.avatar:
            old_path = os.path.join(upload_folder, current_user.avatar)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
                    
        file.save(os.path.join(upload_folder, filename))
        
        try:
            current_user.avatar = filename
            db.session.commit()
            return jsonify({
                'status': 'success', 
                'message': 'Profile picture updated successfully!',
                'filename': filename,
                'url': url_for('static', filename='uploads/avatars/' + filename)
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'status': 'error', 'message': f'Database error: {str(e)}'}), 500
    else:
        return jsonify({'status': 'error', 'message': 'Allowed image types are: png, jpg, jpeg, gif.'}), 400

@main_bp.route('/profile/avatar/remove', methods=['POST'])
@login_required
def remove_avatar():
    if current_user.avatar:
        upload_folder = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars')
        old_path = os.path.join(upload_folder, current_user.avatar)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass
        try:
            current_user.avatar = None
            db.session.commit()
            return jsonify({'status': 'success', 'message': 'Profile picture removed.'})
        except Exception as e:
            db.session.rollback()
            return jsonify({'status': 'error', 'message': f'Database error: {str(e)}'}), 500
    return jsonify({'status': 'error', 'message': 'No avatar to remove.'}), 400
