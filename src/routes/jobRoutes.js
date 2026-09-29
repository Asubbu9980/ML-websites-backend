import express from 'express';
import cors from 'cors';
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
} from '../controllers/jobController.js';

export const jobRouter = express.Router();

// CORS configuration for Job Posting APIs (WordPress/React website)
const jobsCors = cors((req, cb) => {
  const origin = req.header('Origin');
  const allowedOriginsStr = process.env.JOBS_ALLOWED_ORIGINS || process.env.MOTIVITYLABS_ALLOWED_ORIGINS || '*';
  
  let isAllowed = false;
  if (allowedOriginsStr === '*') {
    isAllowed = true;
  } else {
    const allowedList = allowedOriginsStr.split(',').map((o) => o.trim().toLowerCase());
    isAllowed = !origin || allowedList.includes(origin.toLowerCase());
  }

  cb(null, {
    origin: isAllowed ? origin || '*' : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });
});

// Enable CORS and JSON body handling for job routes
jobRouter.use(jobsCors);

// Route definitions
jobRouter.post('/', createJob);
jobRouter.get('/', getJobs);
jobRouter.get('/:id', getJobById);
jobRouter.put('/:id', updateJob);
jobRouter.delete('/:id', deleteJob);
