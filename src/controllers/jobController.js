import mongoose from 'mongoose';
import { JobPosting } from '../models/JobPosting.js';

/**
 * Check if MongoDB is connected.
 */
function checkDBConnection(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      ok: false,
      error: 'Database service unavailable. Please ensure MONGODB_URI is configured and connected.',
    });
    return false;
  }
  return true;
}

/**
 * POST /api/jobs
 * Create a new job posting (HR/Admin)
 */
export async function createJob(req, res) {
  if (!checkDBConnection(res)) return;

  try {
    const {
      jobId,
      title,
      description,
      skills,
      experienceMin,
      experienceMax,
      jobType,
      location,
      expiryDate,
      status,
    } = req.body;

    // Validation
    const errors = [];
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) errors.push('jobId is required and must be a string');
    if (!title || typeof title !== 'string' || !title.trim()) errors.push('title is required and must be a string');
    if (!description || typeof description !== 'string' || !description.trim()) errors.push('description is required and must be a string');
    if (!skills || !Array.isArray(skills) || skills.length === 0) errors.push('skills must be a non-empty array of strings');
    if (experienceMin === undefined || experienceMin === null || isNaN(Number(experienceMin))) errors.push('experienceMin is required and must be a number');

    if (errors.length > 0) {
      return res.status(400).json({ ok: false, errors });
    }

    const trimmedJobId = jobId.trim();

    // Case-insensitive check for existing jobId
    const existingJob = await JobPosting.findOne({
      jobId: new RegExp(`^${trimmedJobId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (existingJob) {
      return res.status(409).json({
        ok: false,
        error: `Job ID ${trimmedJobId} is already taken`,
      });
    }

    const parsedExpiryDate = expiryDate && !isNaN(new Date(expiryDate).getTime()) ? new Date(expiryDate) : null;

    const newJob = await JobPosting.create({
      jobId: trimmedJobId,
      title: title.trim(),
      description: description.trim(),
      skills: skills.map((s) => String(s).trim()).filter(Boolean),
      experienceMin: Number(experienceMin),
      experienceMax: experienceMax !== undefined && experienceMax !== null && experienceMax !== '' ? Number(experienceMax) : null,
      jobType: jobType && typeof jobType === 'string' && jobType.trim() ? jobType.trim() : 'Full-time',
      location: location ? location.trim() : '',
      expiryDate: parsedExpiryDate,
      status: status || 'published',
    });

    return res.status(201).json({
      ok: true,
      message: 'Job posting created successfully',
      data: newJob,
    });
  } catch (error) {
    if (error.code === 11000) {
      const targetId = req.body?.jobId ? String(req.body.jobId).trim() : '';
      return res.status(409).json({
        ok: false,
        error: targetId ? `Job ID ${targetId} is already taken` : 'Job ID is already taken',
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ ok: false, errors: messages });
    }
    return res.status(500).json({ ok: false, error: 'Failed to create job posting: ' + error.message });
  }
}

/**
 * GET /api/jobs
 * Get active, non-expired, published jobs for public Careers page (or all for admin if query parameter set)
 */
export async function getJobs(req, res) {
  if (!checkDBConnection(res)) return;

  try {
    const { includeAll, status } = req.query;

    let query = {};

    if (includeAll === 'true' || status === 'all') {
      // Admin request: return all jobs
      query = {};
    } else if (status) {
      // Filter by specific status
      query = { status };
    } else {
      // Default public Careers page: return published jobs that have NOT expired (or have no expiry date)
      query = {
        status: 'published',
        $or: [{ expiryDate: null }, { expiryDate: { $gte: new Date() } }],
      };
    }

    const jobs = await JobPosting.find(query).sort({ createdAt: -1 });

    return res.json({
      ok: true,
      count: jobs.length,
      data: jobs,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch job postings: ' + error.message });
  }
}

/**
 * Helper to build case-insensitive query for ObjectId or jobId
 */
function buildJobQuery(id) {
  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return isObjectId ? { $or: [{ _id: id }, { jobId: regex }] } : { jobId: regex };
}

/**
 * GET /api/jobs/:id
 * Get a single job posting by ID (MongoDB _id or custom jobId)
 */
export async function getJobById(req, res) {
  if (!checkDBConnection(res)) return;

  const { id } = req.params;

  try {
    const job = await JobPosting.findOne(buildJobQuery(id));

    if (!job) {
      return res.status(404).json({ ok: false, error: 'Job posting not found' });
    }

    return res.json({
      ok: true,
      data: job,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch job posting: ' + error.message });
  }
}

/**
 * PUT /api/jobs/:id
 * Update an existing job posting (HR/Admin)
 */
export async function updateJob(req, res) {
  if (!checkDBConnection(res)) return;

  const { id } = req.params;

  try {
    const {
      jobId,
      title,
      description,
      skills,
      experienceMin,
      experienceMax,
      jobType,
      location,
      expiryDate,
      status,
    } = req.body;

    const updates = {};

    if (jobId !== undefined) updates.jobId = String(jobId).trim();
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (skills !== undefined) {
      if (!Array.isArray(skills) || skills.length === 0) {
        return res.status(400).json({ ok: false, error: 'skills must be a non-empty array of strings' });
      }
      updates.skills = skills.map((s) => String(s).trim()).filter(Boolean);
    }
    if (experienceMin !== undefined) updates.experienceMin = Number(experienceMin);
    if (experienceMax !== undefined) {
      updates.experienceMax = experienceMax !== null && experienceMax !== '' ? Number(experienceMax) : null;
    }
    if (jobType !== undefined) updates.jobType = jobType && String(jobType).trim() ? String(jobType).trim() : 'Full-time';
    if (location !== undefined) updates.location = String(location).trim();
    if (expiryDate !== undefined) {
      updates.expiryDate = expiryDate && !isNaN(new Date(expiryDate).getTime()) ? new Date(expiryDate) : null;
    }
    if (status !== undefined) updates.status = String(status).trim();

    const updatedJob = await JobPosting.findOneAndUpdate(
      buildJobQuery(id),
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedJob) {
      return res.status(404).json({ ok: false, error: 'Job posting not found' });
    }

    return res.json({
      ok: true,
      message: 'Job posting updated successfully',
      data: updatedJob,
    });
  } catch (error) {
    if (error.code === 11000) {
      const targetId = req.body?.jobId ? String(req.body.jobId).trim() : '';
      return res.status(409).json({
        ok: false,
        error: targetId ? `Job ID ${targetId} is already taken` : 'Job ID is already taken',
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ ok: false, errors: messages });
    }
    return res.status(500).json({ ok: false, error: 'Failed to update job posting: ' + error.message });
  }
}

/**
 * DELETE /api/jobs/:id
 * Delete job posting document from MongoDB by ObjectId or jobId
 */
export async function deleteJob(req, res) {
  if (!checkDBConnection(res)) return;

  const { id } = req.params;

  try {
    const deletedJob = await JobPosting.findOneAndDelete(buildJobQuery(id));

    if (!deletedJob) {
      return res.status(404).json({ ok: false, error: 'Job posting not found' });
    }

    return res.json({
      ok: true,
      message: 'Job posting deleted successfully',
      data: deletedJob,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Failed to delete job posting: ' + error.message });
  }
}
