import { api } from "@/src/api/client";

export interface LegalSummary {
    id: string;
    title: string;
    version: string;
}

export interface LegalDocument {
    id: string;
    title: string;
    version: string;
    effective: string;
    last_updated: string;
    content: string;
}

export default class LegalRepository {

    static async list(): Promise<LegalSummary[]> {
        return api.get("/legal");
    }

    static async get(id: string): Promise<LegalDocument> {
        return api.get(`/legal/${id}`);
    }

}