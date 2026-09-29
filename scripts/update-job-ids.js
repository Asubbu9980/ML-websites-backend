import fs from 'fs';
import mongoose from 'mongoose';
import { JobPosting } from '../src/models/JobPosting.js';

if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    console.error('Failed to load .env:', err.message);
  }
}

async function migrateJobIds() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Fetch all jobs ordered by creation date / _id ascending
    const jobs = await JobPosting.find({}).sort({ createdAt: 1, _id: 1 });
    console.log(`Found ${jobs.length} existing jobs in database.`);

    if (jobs.length === 0) {
      console.log('No jobs found to update.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Step 1: Temporarily assign unique temporary jobIds to avoid index collision during sequential update
    console.log('Assigning temporary IDs to prevent unique index conflicts...');
    for (let i = 0; i < jobs.length; i++) {
      await JobPosting.updateOne({ _id: jobs[i]._id }, { $set: { jobId: `TEMP_${jobs[i]._id}` } });
    }

    // Step 2: Assign final sequential IDs (ML001, ML002, ...)
    console.log('Assigning sequential Job IDs (ML001, ML002, ...)...');
    for (let i = 0; i < jobs.length; i++) {
      const seqId = `ML${String(i + 1).padStart(3, '0')}`;
      await JobPosting.updateOne({ _id: jobs[i]._id }, { $set: { jobId: seqId } });
      console.log(`Updated [${i + 1}/${jobs.length}]: "${jobs[i].title}" -> ${seqId}`);
    }

    console.log('🎉 Successfully updated all job IDs in MongoDB!');
  } catch (error) {
    console.error('❌ Error updating job IDs:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

migrateJobIds();
