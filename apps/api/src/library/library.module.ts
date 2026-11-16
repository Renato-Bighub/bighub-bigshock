import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrgGuard } from "../organizations/org.guard.js";
import { LibraryController } from "./library.controller.js";
import { LibraryService } from "./library.service.js";

@Module({ imports: [AuthModule], controllers: [LibraryController], providers: [LibraryService, OrgGuard] })
export class LibraryModule {}
