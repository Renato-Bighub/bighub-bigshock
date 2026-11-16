import { Controller, Get, Req } from "@nestjs/common";
import type { HealthResponse } from "@bigstock/contracts";
import type { Request } from "express";

@Controller("v1")
export class HealthController {
  @Get("health")
  health(@Req() req: Request): HealthResponse {
    return { status: "ok", request_id: String(req.id) };
  }
}
