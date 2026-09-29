import mongoose from 'mongoose';
import { JobPosting } from '../models/JobPosting.js';

/**
 * Connects to MongoDB using Mongoose.
 * Uses process.env.MONGODB_URI.
 */
export async function connectDB(logger = console) {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    logger.warn('⚠️  MONGODB_URI is not set in environment variables. Job Posting APIs requiring DB will fail until configured.');
    return null;
  }

  try {
    const conn = await mongoose.connect(uri);
    logger.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.log(`📌 MongoDB Database Name: ${conn.connection.name}`);
    logger.log(`📌 JobPosting Collection Name: ${JobPosting.collection.name}`);
    return conn;
  } catch (error) {
    logger.error(`❌ MongoDB connection error: ${error.message}`);
    // Return null rather than crashing server so email service stays operational
    return null;
  }
}
