const express = require('express');
const multer = require('multer');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'echocrypt-super-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echocrypt_users';
console.log('Attempting to connect to MongoDB:', MONGODB_URI);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ SUCCESS: MongoDB connected successfully!');
})
.catch((error) => {
  console.log('❌ ERROR: MongoDB connection failed:');
  console.log('Error message:', error.message);
  console.log('\nPlease make sure MongoDB is running on your system.');
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory:', uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    cb(null, Date.now() + '-' + cleanName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Routes
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: null });
  }
});

app.post('/login', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render('login', { error: 'Database not connected. Please try again later.' });
    }

    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = { id: user._id, username: user.username };
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login' });
  }
});

app.get('/register', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.render('register', { error: null });
  }
});

app.post('/register', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.render('register', { error: 'Database not connected. Please try again later.' });
    }

    const { username, password } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    
    req.session.user = { id: user._id, username: user.username };
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', { error: 'An error occurred during registration' });
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
    const response = await axios.get(`http://localhost:5000/api/audio/${req.session.user.id}`);
    const audioFiles = response.data.success ? response.data.files : [];
    
    res.render('dashboard', { 
      user: req.session.user, 
      audioFiles,
      message: req.query.message 
    });
  } catch (error) {
    console.error('Error fetching audio files:', error);
    res.render('dashboard', { 
      user: req.session.user, 
      audioFiles: [],
      message: 'Error loading audio files' 
    });
  }
});

app.get('/upload', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.render('upload', { user: req.session.user, error: null, success: null });
});

app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
    if (!req.file) {
      return res.render('upload', { 
        user: req.session.user, 
        error: 'Please select an audio file',
        success: null
      });
    }
    
    console.log('File uploaded successfully:', {
      originalName: req.file.originalname,
      savedAs: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
    
    if (!fs.existsSync(req.file.path)) {
      console.error('File does not exist at path:', req.file.path);
      return res.render('upload', { 
        user: req.session.user, 
        error: 'File upload failed. Please try again.',
        success: null
      });
    }
    
    const filePath = req.file.path.replace(/\\/g, '/');
    
    // Create FormData for sending to Python backend
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(filePath));
    formData.append('user_id', req.session.user.id);
    
    // Send to Python backend for processing
    const response = await axios.post('http://localhost:5000/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    if (response.data.success) {
      res.redirect('/dashboard?message=Audio uploaded and processed successfully');
    } else {
      res.render('upload', { 
        user: req.session.user, 
        error: 'Error processing audio: ' + response.data.error,
        success: null
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.render('upload', { 
      user: req.session.user, 
      error: 'An error occurred during upload: ' + error.message,
      success: null
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});