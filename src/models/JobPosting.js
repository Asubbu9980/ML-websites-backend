import mongoose from 'mongoose';

const jobPostingSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: [true, 'Job ID is required'],
      trim: true,
      match: [/^[A-Za-z0-9-]+$/, 'Job ID can only contain letters, numbers, and hyphens'],
    },
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
    },
    skills: {
      type: [String],
      required: [true, 'Skills are required'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one skill is required',
      },
    },
    experienceMin: {
      type: Number,
      required: [true, 'Minimum experience is required'],
      min: [0, 'Minimum experience cannot be negative'],
    },
    experienceMax: {
      type: Number,
      default: null,
    },
    jobType: {
      type: String,
      default: 'Full-time',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['published', 'draft', 'closed'],
      default: 'published',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
jobPostingSchema.index({ jobId: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
jobPostingSchema.index({ status: 1, expiryDate: 1 });

export const JobPosting = mongoose.models.JobPosting || mongoose.model('JobPosting', jobPostingSchema);
