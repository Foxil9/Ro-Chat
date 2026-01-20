const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: Number,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 200 // Limit message length
  }
}, {
  timestamps: true
});

// Index for efficient queries
messageSchema.index({ jobId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
