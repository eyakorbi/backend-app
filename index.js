const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const axios = require('axios');
const os = require('os');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Variables d'environnement (avec fallback)
const DB_HOST = process.env.DB_HOST || 'database-2-instance-1.cdeca68c4wr5.us-east-1.rds.amazonaws.com';
const DB_USER = process.env.DB_USER || 'eyakorbi';
const DB_PASSWORD = process.env.DB_PASSWORD || 'eyakorbi0000';
const DB_NAME = process.env.DB_NAME || 'database-2-instance-1';

//  // Database connection
//  const db = mysql.createConnection({
//   host: process.env.DB_HOST || 'database-2-instance-1.cdeca68c4wr5.us-east-1.rds.amazonaws.com',
//   user: process.env.DB_USER || 'eyakorbi',
//   password: process.env.DB_PASSWORD || 'eyakorbi0000',
//   database: process.env.DB_NAME || 'database-2-instance-1'
// });


// First connection (without database) to create the database
const tempConnection = mysql.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD
});

tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``, (err) => {
  if (err) {
    console.error('❌ Error creating database:', err);
    return;
  }
  console.log('✅ Database ensured');

  tempConnection.end();

  // Database connection
  const db = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  });

  db.connect((err) => {
    if (err) {
      console.error('Error connecting to the database:', err);
      return;
    }
    console.log('Connected to MySQL database');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const insertUsersQuery = `
      INSERT IGNORE INTO users (name, email) VALUES
      ('John Doe', 'john@example.com'),
      ('Jane Smith', 'jane@example.com'),
      ('Bob Johnson', 'bob@example.com');
    `;

    db.query(createTableQuery, (err) => {
      if (err) console.error('❌ Error creating table:', err);
      else console.log('✅ Users table ready');

      db.query(insertUsersQuery, (err) => {
        if (err) console.error('❌ Error inserting users:', err);
        else console.log('✅ Sample users inserted');
      });
    });
  });

  // Routes
  app.get('/server-info', async (req, res) => {
    try {
      let instanceId = 'unknown';
      let availabilityZone = 'unknown';

      try {
        const instanceIdResponse = await axios.get('http://169.254.169.254/latest/meta-data/instance-id');
        const availabilityZoneResponse = await axios.get('http://169.254.169.254/latest/meta-data/placement/availability-zone');
        instanceId = instanceIdResponse.data;
        availabilityZone = availabilityZoneResponse.data;
      } catch {
        console.log('Not running on EC2 or metadata service not available');
      }

      res.json({
        instanceId,
        availabilityZone,
        hostname: os.hostname(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching server info:', error);
      res.status(500).json({ error: 'Failed to get server information' });
    }
  });

  app.get('/', (req, res) => {
    res.status(200).json('Hello from Backend app!');
  });

  app.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    });
  });

  app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(results[0]);
    });
  });

  app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    db.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email], (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: result.insertId, name, email });
    });
  });

  app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    db.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId], (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ id: userId, name, email });
    });
  });

  app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      res.status(204).send();
    });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});
