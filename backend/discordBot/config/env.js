require('dotenv').config({ path: '../../.env' });




function required(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return process.env[name];
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",

  db: {
    url: required("DATABASE_URL"),
  },
  admin:{
    name: required("ADMIN_USERNAME"),
    hash: required("ADMIN_HASH"),
  },

  jwtSecret: required("JWT_SECRET"),
};

module.exports = config;