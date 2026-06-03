import { requirePageSession } from "@/lib/auth";
import { formatRoleLabel } from "@/lib/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRound } from "lucide-react";

export default async function SettingsPage() {
  const current = await requirePageSession();

  return (
    <div className="grid">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="panel-icon">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">账号信息</CardTitle>
              <CardDescription>你的登录身份与基本资料</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="info-grid">
            <div className="info-item">
              <p className="info-label">昵称</p>
              <p className="info-value">{current.user.displayName || "-"}</p>
            </div>
            <div className="info-item">
              <p className="info-label">登录邮箱</p>
              <p className="info-value">{current.user.email}</p>
            </div>
            <div className="info-item">
              <p className="info-label">角色</p>
              <p className="info-value">{formatRoleLabel(current.user.role)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <p className="text-sm leading-6 text-muted-foreground">
              本工作台提供 AI 对话、音频工具与数据采集三大核心能力。如需退出，请使用右上角的“退出登录”。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
