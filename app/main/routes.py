import os
import json
import random
from flask import render_template, request, jsonify, current_app
from flask_login import login_required, current_user
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
    
    return render_template(
        'dashboard.html', 
        results=results, 
        total_tests=total_tests,
        avg_wpm=round(avg_wpm, 1),
        avg_accuracy=round(avg_accuracy, 1),
        pb_wpm=round(pb_wpm, 1),
        pb_accuracy=round(pb_accuracy, 1)
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
