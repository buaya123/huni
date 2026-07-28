import { api } from "@/src/api/client";

export class ReportRepository {

    static async report(
        targetType: string,
        targetId: string,
        reason: string,
    ): Promise<void> {

        await api.post("/report", {
            target_type: targetType,
            target_id: targetId,
            reason,
        });

    }

}