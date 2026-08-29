import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  realName: string;
  username: string;
  email: string;
  password: string;
  avatar: string; // base64 or URL
  groupId?: mongoose.Types.ObjectId | null;
  location?: {
    lat: number;
    lng: number;
    updatedAt: Date;
    address?: string;
  };
  pushSubscription?: any;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    realName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date },
      address: { type: String },
    },
    pushSubscription: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User;
