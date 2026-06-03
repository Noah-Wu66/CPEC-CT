import ChatApp from "./ChatApp";
import { requirePageSession } from "@/lib/auth";
import { ToastProvider } from "./components/ToastProvider";

export default async function AiPage() {
  const current = await requirePageSession();

  return (
    <ToastProvider>
      <ChatApp
        initialUser={{
          id: current.user._id.toString(),
          email: current.user.email,
          role: current.user.role,
        }}
      />
    </ToastProvider>
  );
}
