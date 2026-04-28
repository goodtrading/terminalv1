import { drizzle } from "drizzle-orm/node-postgres";

import pg from "pg";

import * as schema from "@shared/schema";



const url = process.env.DATABASE_URL;



export const pool: pg.Pool | null = url

  ? new pg.Pool({

      connectionString: url,

      max: 10,

      ssl: {

        rejectUnauthorized: false

      }

    })

  : null;



export const db = pool ? drizzle(pool, { schema }) : null;
