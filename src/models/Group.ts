import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGroup extends Document {
  name: string;
  description: string;
  inviteCode: string;
  owner: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, maxlength: 30 },
    description: { type: String, default: "" },
    inviteCode: { type: String, required: true, unique: true, uppercase: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    color: { type: String, default: "#FF8A65" },
  },
  { timestamps: true }
);

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

GroupSchema.pre("validate", function () {
  const doc = this as any;
  if (!doc.inviteCode) doc.inviteCode = genCode();
  if (!doc.color) {
    const colors = ["#FF8A65", "#4DB6AC", "#64B5F6", "#FFB74D", "#BA68C8", "#81C784", "#FFD54F", "#90A4AE"];
    doc.color = colors[Math.floor(Math.random() * colors.length)];
  }
});

const Group: Model<IGroup> = mongoose.models.Group || mongoose.model<IGroup>("Group", GroupSchema);
export default Group;
export { genCode };
