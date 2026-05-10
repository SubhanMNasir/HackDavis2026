import { redirect } from "next/navigation";

// Root marker — Clerk middleware ensures authenticated users get here.
// We send everyone to /log, the volunteer's home tab.
export default function Home() {
  redirect("/log");
}
