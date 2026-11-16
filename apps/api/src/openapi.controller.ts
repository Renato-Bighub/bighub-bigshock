import { Controller, Get, Header } from "@nestjs/common";
import { buildOpenApi } from "./openapi.js";

@Controller("v1")
export class OpenApiController {
  private readonly doc = buildOpenApi();

  /** Pública: a especificação não contém dados de clientes. */
  @Get("openapi.json")
  @Header("Cache-Control", "public, max-age=300")
  spec() {
    return this.doc;
  }
}
