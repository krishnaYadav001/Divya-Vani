import type { Metadata } from "next";
import ChatUI from "@/app/components/ChatUI";

export const metadata: Metadata = {
  alternates: { canonical: "/chat" },
};

export default function ChatPage() {
  return <ChatUI />;
}
