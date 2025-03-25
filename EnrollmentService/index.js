const express = require('express');
const app = express();
const uuid = require('uuid');
const cron = require('node-cron');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { body, param, validationResult } = require('express-validator');

require('dotenv').config();

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

// Add request logging
app.use(morgan('combined'));

app.use(express.json());

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
});

// Remove the Maps since we're using database now
// const enrollments = new Map();
// const vehicles = new Map();

// Helper function to generate unique enrollment ID
const generateEnrollmentId = () => {
    return uuid.v4();
};

// Validation middleware
const validateEnrollRequest = [
  body('vin').isString().isLength({ min: 17, max: 17 }),
  body('decodedDetails').isObject(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// POST /enroll with validation
app.post('/enroll', validateEnrollRequest, async (req, res) => {
    const { vin, decodedDetails } = req.body;

    try {
        // Check cache first for duplicate VIN
        const cachedVehicle = await redis.get(`vehicle:${vin}`);
        if (cachedVehicle) {
            return res.status(409).json({ error: 'Vehicle with this VIN already exists' });
        }

        // Check for duplicate VIN in succeeded enrollments
        const checkQuery = `
            SELECT enrollment_id FROM enrollments 
            WHERE vin = ? AND status = 'succeeded'
            LIMIT 1
        `;

        connection.query(checkQuery, [vin], (err, results) => {
            if (err) {
                console.error('Error checking VIN:', err);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (results.length > 0) {
                return res.status(409).json({ message: 'Vehicle with this VIN already exists' });
            }

            // Create new enrollment
            const enrollmentId = generateEnrollmentId();
            const insertQuery = `
                INSERT INTO enrollments (enrollment_id, vin, decoded_details, status) 
                VALUES (?, ?, ?, 'inProgress')
            `;

            connection.query(insertQuery, [enrollmentId, vin, JSON.stringify(decodedDetails)], (err) => {
                if (err) {
                    console.error('Error creating enrollment:', err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                console.log(`Enrollment ID: ${enrollmentId}`);

                // Cache the new enrollment
                redis.setex(`enrollment:${enrollmentId}`, 3600, JSON.stringify({
                    status: 'inProgress',
                    vin,
                    decodedDetails
                }));

                res.status(202).json({ enrollmentId });
            });
        });
    } catch (error) {
        console.error('Error in enrollment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /status/:enrollmentId with caching
app.get('/status/:enrollmentId', param('enrollmentId').isUUID(), async (req, res) => {
    if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    try {
        // Check cache first
        const cachedStatus = await redis.get(`enrollment:${req.params.enrollmentId}`);
        if (cachedStatus) {
            const parsed = JSON.parse(cachedStatus);
            if (parsed.status === 'succeeded') {
                return res.json({ status: parsed.status });
            }
        }

        const query = 'SELECT status FROM enrollments WHERE enrollment_id = ?';
        
        connection.query(query, [req.params.enrollmentId], (err, results) => {
            if (err) {
                console.error('Error fetching enrollment status:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ error: 'Enrollment not found' });
            }
            
            // Cache the result
            if (results.length > 0) {
                redis.setex(`enrollment:${req.params.enrollmentId}`, 3600, JSON.stringify(results[0]));
            }

            res.json({ status: results[0].status });
        });
    } catch (error) {
        console.error('Error fetching status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /vehicle/:vin with caching
app.get('/vehicle/:vin', param('vin').isLength({ min: 17, max: 17 }), async (req, res) => {
    if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Invalid VIN' });
    }

    try {
        // Check cache first
        const cachedVehicle = await redis.get(`vehicle:${req.params.vin}`);
        if (cachedVehicle) {
            return res.json(JSON.parse(cachedVehicle));
        }

        const { vin } = req.params;
        
        const query = `
            SELECT vin, decoded_details, status 
            FROM enrollments 
            WHERE vin = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
        `;

        connection.query(query, [vin], (err, results) => {
            if (err) {
                console.error('Error fetching vehicle:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'Vehicle not found' });
            }

            const enrollment = results[0];

            if (enrollment.status === 'inProgress') {
                return res.status(409).json({ error: 'Vehicle enrollment in progress' });
            }

            if (enrollment.status === 'succeeded') {
                // Cache successful responses
                const vehicleData = {
                    vin: enrollment.vin,
                    decodedDetails: JSON.parse(enrollment.decoded_details)
                };
                redis.setex(`vehicle:${req.params.vin}`, 3600, JSON.stringify(vehicleData));
                return res.json(vehicleData);
            }

            return res.status(404).json({ error: 'Vehicle not found' });
        });
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create tables if they don't exist
const initializeDatabase = () => {
  // Create enrollments table with VIN index
  connection.query(`
    CREATE TABLE IF NOT EXISTS enrollments (
      enrollment_id VARCHAR(36) PRIMARY KEY,
      vin VARCHAR(17) NOT NULL,
      decoded_details JSON,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status ENUM('inProgress', 'succeeded', 'failed') DEFAULT 'inProgress',
      INDEX idx_vin (vin)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating enrollments table:', err);
      process.exit(1);
    }
    console.log('Enrollments table ready');
  });
};

// Update the enrollment status update function to handle cache
const updateEnrollmentStatuses = async () => {
    try {
        const query = `
            UPDATE enrollments 
            SET status = 'succeeded' 
            WHERE status = 'inProgress' 
            AND timestamp <= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        `;

        connection.query(query, async (err, result) => {
            if (err) {
                console.error('Error updating enrollment statuses:', err);
                return;
            }
            if (result.changedRows > 0) {
                // Clear related caches
                const keys = await redis.keys('enrollment:*');
                if (keys.length > 0) {
                    await redis.del(keys);
                }
                console.log(`Updated ${result.changedRows} enrollments to succeeded status`);
            }
        });
    } catch (error) {
        console.error('Error in updateEnrollmentStatuses:', error);
    }
};

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL!');
  
  // Initialize database tables
  initializeDatabase();
  
  // Schedule cron job to run every minute
  cron.schedule('* * * * *', () => {
    console.log('Running enrollment status update job');
    updateEnrollmentStatuses();
  });
  
  // Only start the server after successfully connecting to the database
  app.listen(process.env.PORT, () => {
    console.log(`Enrollment service listening at http://localhost:${process.env.PORT}`);
  });
});


// Note: Create another cron job for creation of object in DB as separate table, will required adding one bool field in original table. 
// Having VIN at start of cache key. 