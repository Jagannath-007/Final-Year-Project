from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime
import json
from bson import ObjectId
import logging
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import audio processing functions
try:
    from audio_processing import process_audio_file
except ImportError:
    # Fallback mock function
    def process_audio_file(file_path):
        logger.info(f"Processing audio file: {file_path}")
        import time
        time.sleep(0.5)
        return {
            'fingerprint': 'mock_fingerprint_' + str(uuid.uuid4()),
            'duration': 120.5,
            'sample_rate': 44100,
            'bitrate': 320
        }

load_dotenv()

app = Flask(__name__)
CORS(app)

# Create uploads directory
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# MongoDB connection
try:
    client = MongoClient(os.getenv('MONGODB_URI', 'mongodb://localhost:27017/'))
    db = client.echocrypt
    client.admin.command('ping')
    logger.info("✅ Successfully connected to MongoDB")
except Exception as e:
    logger.error(f"❌ Failed to connect to MongoDB: {e}")
    client = None
    db = None

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return json.JSONEncoder.default(self, o)

app.json_encoder = JSONEncoder

@app.route('/api/upload', methods=['POST'])
def upload_audio():
    try:
        if db is None:
            return jsonify({'success': False, 'error': 'Database not available'}), 500
            
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': 'No audio file provided'}), 400
        
        file = request.files['audio']
        user_id = request.form.get('user_id', 'anonymous')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Generate unique filename
        filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Process the audio file
        result = process_audio_file(file_path)
        
        # Store in database
        audio_data = {
            'user_id': user_id,
            'original_filename': file.filename,
            'file_path': file_path,
            'fingerprint': result['fingerprint'],
            'duration': result['duration'],
            'sample_rate': result['sample_rate'],
            'bitrate': result.get('bitrate', 0),
            'created_at': datetime.now()
        }
        
        insert_result = db.audio_files.insert_one(audio_data)
        audio_data['_id'] = str(insert_result.inserted_id)
        
        return jsonify({
            'success': True,
            'data': audio_data,
            'message': 'Audio uploaded and processed successfully'
        })
    
    except Exception as e:
        logger.error(f"Error in upload_audio: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/audio/<user_id>', methods=['GET'])
def get_user_audio_files(user_id):
    try:
        if db is None:
            return jsonify({'success': False, 'error': 'Database not available'}), 500
            
        files = list(db.audio_files.find({'user_id': user_id}).sort('created_at', -1))
        
        for file in files:
            file['_id'] = str(file['_id'])
        
        return jsonify({'success': True, 'files': files})
    
    except Exception as e:
        logger.error(f"Error in get_user_audio_files: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/audio/file/<file_id>', methods=['GET'])
def get_audio_file(file_id):
    try:
        if db is None:
            return jsonify({'success': False, 'error': 'Database not available'}), 500
            
        file = db.audio_files.find_one({'_id': ObjectId(file_id)})
        
        if not file:
            return jsonify({'success': False, 'error': 'File not found'}), 404
        
        file['_id'] = str(file['_id'])
        return jsonify({'success': True, 'file': file})
    
    except Exception as e:
        logger.error(f"Error in get_audio_file: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/audio/<file_id>', methods=['DELETE'])
def delete_audio_file(file_id):
    try:
        if db is None:
            return jsonify({'success': False, 'error': 'Database not available'}), 500
            
        result = db.audio_files.delete_one({'_id': ObjectId(file_id)})
        
        if result.deleted_count == 0:
            return jsonify({'success': False, 'error': 'File not found'}), 404
            
        return jsonify({'success': True, 'message': 'File deleted successfully'})
    
    except Exception as e:
        logger.error(f"Error in delete_audio_file: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    db_status = 'connected' if db is not None else 'disconnected'
    return jsonify({
        'status': 'healthy', 
        'message': 'EchoCrypt backend is running',
        'database': db_status
    })

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)