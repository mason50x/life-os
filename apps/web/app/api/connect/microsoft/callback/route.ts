import { finishConnect } from "@/lib/connect";

export const GET = (req: Request) => finishConnect("outlook", req);
