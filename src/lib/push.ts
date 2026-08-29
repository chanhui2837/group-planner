import webpush from "web-push";
import User from "@/models/User";
import Group from "@/models/Group";

let configured = false;
function ensure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
  }
  return true;
}

export async function sendPushToGroup(groupId: string, senderId: string, payload: { title: string; body: string; url?: string; type: "message" | "schedule" | "vote" }) {
  if (!ensure()) {
    console.log("[PUSH] VAPID 미설정 — 푸시 스킵");
    return;
  }
  try {
    const group = await Group.findById(groupId).select("members").lean();
    if (!group) return;
    const members = (group as any).members as any[];
    const users = await User.find({ _id: { $in: members }, pushSubscription: { $ne: null } }).select("pushSubscription username").lean();
    const data = JSON.stringify(payload);
    let sent = 0;
    for (const u of users as any[]) {
      if (String(u._id) === String(senderId)) continue; // 발송자 제외
      if (!u.pushSubscription) continue;
      try {
        await webpush.sendNotification(u.pushSubscription, data);
        sent++;
      } catch (e: any) {
        console.warn(`[PUSH] 발송 실패 ${u.username}: ${e.message} status=${e.statusCode}`);
        if (e.statusCode === 410 || e.statusCode === 404) {
          // 만료된 구독 제거
          await User.findByIdAndUpdate(u._id, { pushSubscription: null });
          console.log(`[PUSH] 만료 구독 제거: ${u.username}`);
        }
      }
    }
    console.log(`✅ [PUSH] 그룹 발송 완료: ${sent}명에게 "${payload.title}"`);
  } catch (e: any) {
    console.error("[PUSH] 그룹 발송 오류:", e.message);
  }
}
