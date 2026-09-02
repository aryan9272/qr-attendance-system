const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    googleId: {
      type: String,
      index: true,
      sparse: true,
    },
    password: {
      type: String,
      required: false,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['faculty', 'admin'],
      default: 'faculty',
    },
    department: {
      type: String,
      default: 'Information Technology',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Faculty', facultySchema);
