const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Kafka } = require('kafkajs');

// Create a Kafka instance
const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'] // Replace with your Kafka container host and port
});

const producer = kafka.producer();

const app = express();
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    await producer.connect();

    fs.createReadStream(file.path)
        .pipe(csv())
        .on('data', (row) => {
            console.log(row.VIN);
            producer.send({
                topic: 'vin-topic',
                messages: [{ value: row.VIN }]
            });
        })
        .on('end', () => {
        });
    res.send('File uploaded successfully'); 
});

// Starting the server
app.listen(3001, () => {
console.log('Server is running on port 3001');
});