export {};

declare module "fastify" {
  interface FastifyRequest {
    admin: {
      id: string;
      email: string;
      role: string;
    };
  }
}
