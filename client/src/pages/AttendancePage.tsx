// The attendance back office (a separate app) shown inside MAS. The page area is the viewport minus the top bar and padding.
const ATTENDANCE_URL = 'https://bak-attendance-v3-qxkt.vercel.app';

export default function AttendancePage() {
  return (
    <iframe
      src={ATTENDANCE_URL}
      title="Attendance"
      allow="geolocation; camera; clipboard-write"
      className="block w-full rounded-xl border border-slate-200 bg-white"
      style={{ height: 'calc(100vh - 8rem)', minHeight: 480 }}
    />
  );
}
