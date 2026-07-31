import { api } from "@/src/api/client";
import type { AdminReport } from "@/src/types/admin";

class AdminReportsRepository {
    async getReports(
        offset = 0,
        limit = 20,
    ): Promise<AdminReport[]> {

        return api.get<AdminReport[]>(
            `/admin/reports?offset=${offset}&limit=${limit}`
        );
    }

    async dismissReport(reportId: string): Promise<void> {
        await api.post(
            `/admin/reports/${reportId}/dismiss`
        );
    }

async resolve(
    id: string,
    body: {
        action: string;
        violation: string;
        note: string;
        notify: boolean;
    }
): Promise<void> {
    await api.post(
        `/admin/reports/${id}/resolve`,
        body
    );
}
}

export default new AdminReportsRepository();