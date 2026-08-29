import mongoose, { Schema, Document, Model } from "mongoose";

export type MessageType = "text" | "schedule" | "vote" | "system";

export interface IMessage extends Document {
  groupId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  type: MessageType;
  content: string;
  // schedule
  schedule?: {
    title: string;
    date: string;
    time: string;
    description?: string;
    location?: string;
  };
  // vote
  vote?: {
    question: string;
    options: { text: string; votes: mongoose.Types.ObjectId[] }[];
    allowMultiple: boolean;
    expiresAt?: Date;
    closed: boolean;
  };
  // direct message fields (reuse same collection with isDirect)
  isDirect?: boolean;
  receiver?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "schedule", "vote", "system"], default: "text" },
    content: { type: String, default: "" },
    schedule: {
      title: String,
      date: String,
      time: String,
      description: String,
      location: String,
    },
    vote: {
      question: String,
      options: [
        {
          text: String,
          votes: [{ type: Schema.Types.ObjectId, ref: "User" }],
        },
      ],
      allowMultiple: { type: Boolean, default: false },
      expiresAt: Date,
      closed: { type: Boolean, default: false },
    },
    isDirect: { type: Boolean, default: false },
    receiver: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

MessageSchema.index({ groupId: 1, createdAt: -1 });
MessageSchema.index({ isDirect: 1, sender: 1, receiver: 1 });

const Message: Model<IMessage> = mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);
export default Message;
