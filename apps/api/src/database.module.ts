import { Global, Module } from "@nestjs/common";
import { createDb, type Database } from "@bigstock/database";

export const DB = Symbol("DB");

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database => {
        // APP_DATABASE_URL = papel da aplicação (sem BYPASSRLS); DATABASE_URL é o fallback em desenvolvimento.
        const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
        if (!url) throw new Error("APP_DATABASE_URL or DATABASE_URL is required");
        return createDb(url).db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule {}
