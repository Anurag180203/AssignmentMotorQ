const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const { Kafka } = require('kafkajs');

require('dotenv').config();

// Rate limiting properties
let tokens = 5;
let maxTokens = 5;
let lastRefill = Date.now();
let refillInterval = 60000;

const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID,
    brokers: [process.env.KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID });
const results = [];

async function refillTokens() {
    const now = Date.now();
    const timePassed = now - lastRefill;
    const tokensToAdd = Math.floor(timePassed / refillInterval) * maxTokens;
    
    if (tokensToAdd > 0) {
        tokens = Math.min(maxTokens, tokens + tokensToAdd);
        lastRefill = now;
    }
}

async function waitForToken() {
    await refillTokens();
    
    if (this.tokens <= 0) {
        // Wait until next token refill
        const waitTime = refillInterval - (Date.now() - lastRefill);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        await refillTokens();
    }
    
    this.tokens--;
}

async function startConsumer() {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: process.env.KAFKA_TOPIC, fromBeginning: true });
  
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const vin = message.value.toString();
          console.log(`Processing VIN: ${vin}`);
          await waitForToken();
          try {
            // Call the NHTSA API to decode the VIN
            const response = await axios.get(
              `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
            );
  
            // Extract relevant vehicle information
            const decodedData = response.data.Results.reduce((acc, item) => {
              switch(item.Variable) {
                case 'Make':
                case 'Model':
                case 'Model Year':
                case 'Manufacturer Name':
                case 'Series':
                case 'Vehicle Type':
                case 'Plant Country':
                case 'Body Class':
                  acc[item.Variable] = item.Value;
                  break;
              }
              return acc;
            }, {});
  
            if (decodedData.Make && decodedData.Model && decodedData['Model Year']) {
                const result = {
                    vin: vin.trim(),
                    decodedData: decodedData
                };
                results.push(result);

                // Send to EnrollmentService
                await axios.post('http://localhost:3000/enroll', {
                    vin: vin.trim(),
                    decodedDetails: decodedData
                });
            }
          } catch (error) {
            console.error(`Error processing VIN ${vin}:`, error.response.data);
          }
        },
      });
    } catch (error) {
      console.error('Error starting consumer:', error);
    }
}

class VinDecodingServer {
    constructor(config) {
        this.uploadsPath = config.uploadsPath || '../API/uploads';
        this.decodedPath = config.decodedPath || './decoded';
        this.apiEndpoint = config.apiEndpoint;
        this.port = config.port || 3002;
        
        // Rate limiting properties
        this.tokens = 5;
        this.maxTokens = 5;
        this.lastRefill = Date.now();
        this.refillInterval = 60000;

        // Add file watcher properties
        this.processedFiles = new Set();
        this.watchInterval = config.watchInterval || 5000; // 5 seconds default

        // Initialize Express
        this.app = express();
        this.app.use(bodyParser.json());
        this.setupRoutes();
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.status(200).json({ status: 'healthy' });
        });

        // Endpoint to process VINs
        this.app.post('/decode', async (req, res) => {
            try {
                const { vins } = req.body;
                if (!Array.isArray(vins)) {
                    return res.status(400).json({ error: 'Please provide an array of VINs' });
                }

                const results = await this.processVins(vins);
                res.status(200).json({ results });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Endpoint to process a file
        this.app.post('/process-file', async (req, res) => {
            try {
                const { filename } = req.body;
                if (!filename) {
                    return res.status(400).json({ error: 'Please provide a filename' });
                }

                const filePath = path.join(this.uploadsPath, filename);
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'File not found' });
                }

                const fileContent = fs.readFileSync(filePath);
                const results = await this.sendToApi(filename, fileContent);
                res.status(200).json({ results });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    async processVins(vins) {
        const results = [];
        for (const vin of vins) {
            if (vin.trim() === '' || vin.trim() === 'VIN') {
                continue;
            }
            
            await this.waitForToken();
            
            try {
                const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin.trim()}?format=json`);
                
                const decodedData = response.data.Results.reduce((acc, item) => {
                    switch(item.Variable) {
                        case 'Make':
                        case 'Model':
                        case 'Model Year':
                        case 'Manufacturer Name':
                        case 'Series':
                        case 'Vehicle Type':
                        case 'Plant Country':
                        case 'Body Class':
                            acc[item.Variable] = item.Value;
                            break;
                    }
                    return acc;
                }, {});

                if (decodedData.Make && decodedData.Model && decodedData['Model Year']) {
                    const result = {
                        vin: vin.trim(),
                        decodedData: decodedData
                    };
                    results.push(result);

                    // Send to EnrollmentService
                    await axios.post('http://localhost:3001/enroll', {
                        vin: vin.trim(),
                        decodedDetails: decodedData
                    });
                }
            } catch (error) {
                console.error(`Error processing VIN ${vin}:`, error);
            }
        }
        return results;
    }

    async refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor(timePassed / this.refillInterval) * this.maxTokens;
        
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    async waitForToken() {
        await this.refillTokens();
        
        if (this.tokens <= 0) {
            // Wait until next token refill
            const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            await this.refillTokens();
        }
        
        this.tokens--;
    }

    async sendToApi(filename, fileContent) {
        try {
            const vins = fileContent.toString().split('\n').filter(vin => vin.trim());
            const results = [];

            for (const vin of vins) {
                if (vin.trim() === '' || vin.trim() === 'VIN') {
                    continue;
                }

                console.log(`Processing VIN: ${vin.trim()}`);
                
                // Wait for available token before making API call
                await this.waitForToken();
                
                const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin.trim()}?format=json`);
                
                // Extract only the requested fields
                const decodedData = response.data.Results.reduce((acc, item) => {
                    switch(item.Variable) {
                        case 'Make':
                        case 'Model':
                        case 'Model Year':
                        case 'Manufacturer Name':
                        case 'Series':
                        case 'Vehicle Type':
                        case 'Plant Country':
                        case 'Body Class':
                            acc[item.Variable] = item.Value;
                            break;
                    }
                    return acc;
                }, {});

                if (decodedData.Make && decodedData.Model && decodedData['Model Year']) {
                    results.push({
                        vin: vin.trim(),
                        decodedData: decodedData
                    });

                    // Send to EnrollmentService
                    const status = await axios.post('http://localhost:3000/enroll', {
                        vin: vin.trim(),
                        decodedDetails: decodedData
                    });

                    console.log(`Status: ${status}`);
                }
            }

            // Save the filtered results
            fs.writeFileSync(
                path.join(this.decodedPath, `decoded_${filename}`),
                JSON.stringify(results, null, 2)
            );

            return results;
        } catch (error) {
            throw new Error(`VIN decoding failed: ${error.message}`);
        }
    }

    // Add new method to watch for files
    watchUploads() {
        setInterval(() => {
            fs.readdir(this.uploadsPath, (err, files) => {
                if (err) {
                    console.error('Error reading uploads directory:', err);
                    return;
                }

                files.forEach(async (filename) => {
                    // Skip if file has already been processed
                    if (this.processedFiles.has(filename)) {
                        return;
                    }

                    const filePath = path.join(this.uploadsPath, filename);
                    try {
                        const fileContent = fs.readFileSync(filePath);
                        console.log(`Processing new file: ${filename}`);
                        
                        const results = await this.sendToApi(filename, fileContent);
                        this.processedFiles.add(filename);
                        
                        // Optionally move or delete the processed file
                        fs.unlinkSync(filePath); // Delete the file after processing
                        
                    } catch (error) {
                        console.error(`Error processing file ${filename}:`, error);
                    }
                });
            });
        }, this.watchInterval);
    }

    async start() {
        // Create necessary directories
        if (!fs.existsSync(this.uploadsPath)) {
            fs.mkdirSync(this.uploadsPath, { recursive: true });
        }
        if (!fs.existsSync(this.decodedPath)) {
            fs.mkdirSync(this.decodedPath, { recursive: true });
        }

        // // Start the file watcher
        // this.watchUploads();

        startConsumer().catch(console.error);
        
        // Start the server
        this.app.listen(this.port, () => {
            console.log(`VIN Decoding Server running on port ${this.port}`);
        });
    }
}

// Usage
const server = new VinDecodingServer({
    uploadsPath: '../API/uploads',
    decodedPath: './decoded',
    port: process.env.PORT,
    apiEndpoint: 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin',
    watchInterval: 5000 // Check every 5 seconds
});

server.start();
