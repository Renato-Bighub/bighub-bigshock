import { Global, Module } from "@nestjs/common";
import { createDb, type Database } from "@bigstock/database";

export const DB = Symbol("DB");

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is required");
        return createDb(url).db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule {}
