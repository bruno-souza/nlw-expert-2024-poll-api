import {z} from "zod";
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify";

export async function createPoll(app: FastifyInstance) {
    app.post('/polls', async (request, response) => {
        const createPollBody = z.object({
            title: z.string(),
            options: z.array(z.string())
        });

        const { title, options } = createPollBody.parse(request.body);

        const poll = await prisma.poll.create({
            data: {
                title,
                options: {
                    createMany: {
                        data: options.map(option => {
                            return { title: option }
                        }),
                    }
                },
            }
        });

        return response.status(201).send({ status: "success", poll_id: poll.id });
    });
}
