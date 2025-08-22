const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Mock User model (should be moved to backend/models/)
const users = [];

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = { id: user.id, username: user.username };
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: 'Invalid username or password' });
    }
  } catch (error) {
    res.render('login', { error: 'An error occurred during login' });
  }
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (users.find(u => u.username === username)) {
      return res.render('register', { error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      createdAt: new Date()
    };
    
    users.push(user);
    req.session.user = { id: user.id, username: user.username };
    res.redirect('/dashboard');
  } catch (error) {
    res.render('register', { error: 'An error occurred during registration' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;