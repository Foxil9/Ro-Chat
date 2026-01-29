const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: false, // Optional for global messages
    index: true
  },
  placeId: {
    type: String,
    required: false, // Optional for server-specific messages
    index: true
  },
  chatType: {
    type: String,
    enum: ['server', 'global'],
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
  },
  editedAt: {
    type: Date,
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
messageSchema.index({ jobId: 1, chatType: 1, createdAt: -1 });
messageSchema.index({ placeId: 1, chatType: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
