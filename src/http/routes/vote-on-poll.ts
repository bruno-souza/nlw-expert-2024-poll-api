import {z} from "zod"
import { randomUUID } from "node:crypto"
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify"
import { redis } from "../../lib/redis";
import { voting } from "../../utils/voting-pub-sub";

export async function voteOnPoll(app: FastifyInstance) {
    app.post('/polls/:pollId/votes', async (request, response) => {
        const voteOnPollBody = z.object({
            pollOptionId: z.string().uuid()
        });

        const voteOnPollParams = z.object({
            pollId: z.string().uuid(),
        });

        const { pollId } = voteOnPollParams.parse(request.params);
        const { pollOptionId } = voteOnPollBody.parse(request.body);

        let { sessionId } = request.cookies;

        if(sessionId) {
            const userHasVotedOnPoll = await prisma.vote.findUnique({
                where: {
                    sessionId_pollId: {
                        sessionId,
                        pollId,
                    },
                }
            });

            if(userHasVotedOnPoll && userHasVotedOnPoll.pollOptionId !== pollOptionId) {
                await prisma.vote.delete({
                    where: {
                        id: userHasVotedOnPoll.id,
                    }
                });

                const votes = await redis.zincrby(pollId, -1, userHasVotedOnPoll.pollOptionId);

                voting.publish(pollId, {
                    pollOptionId: userHasVotedOnPoll.pollOptionId,
                    votes: Number(votes)
                });

            }else if(userHasVotedOnPoll) {
                return response.status(400).send({ message: "You already voted on this poll"});
            }

        }

        if(!sessionId) {
            sessionId = randomUUID();

            response.setCookie('sessionId', sessionId, {
                path: '/',
                maxAge: 60 * 60 * 24 * 30 , // 30 days
                signed: true,
                httpOnly: true, // somente backend acessa esse dado, o front end não consegue.
            })
        }

        await prisma.vote.create({
            data: {
                sessionId,
                pollId,
                pollOptionId,
            }
        });

        const votes = await redis.zincrby(pollId, 1, pollOptionId);

        voting.publish(pollId, {
            pollOptionId,
            votes: Number(votes),
        });

        return response.status(201).send();
    })
}
