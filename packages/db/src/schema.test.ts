import { describe, it, expect } from "vitest";
import {
  sessions,
  messages,
  tasks,
  knowledges,
  agents,
  agentExecutions,
  lessons,
  inboxTasks,
} from "./schema";

describe("Database Schema", () => {
  it("should have sessions table with correct columns", () => {
    expect(sessions).toBeDefined();
    expect(sessions.id).toBeDefined();
    expect(sessions.sessionId).toBeDefined();
    expect(sessions.slackChannel).toBeDefined();
    expect(sessions.slackThreadTs).toBeDefined();
    expect(sessions.createdAt).toBeDefined();
    expect(sessions.updatedAt).toBeDefined();
  });

  it("should have messages table with correct columns", () => {
    expect(messages).toBeDefined();
    expect(messages.id).toBeDefined();
    expect(messages.sessionId).toBeDefined();
    expect(messages.content).toBeDefined();
    expect(messages.role).toBeDefined();
    expect(messages.createdAt).toBeDefined();
  });

  it("should have tasks table with correct columns", () => {
    expect(tasks).toBeDefined();
    expect(tasks.id).toBeDefined();
    expect(tasks.sessionId).toBeDefined();
    expect(tasks.toolName).toBeDefined();
    expect(tasks.toolInput).toBeDefined();
    expect(tasks.toolResult).toBeDefined();
    expect(tasks.durationMs).toBeDefined();
    expect(tasks.status).toBeDefined();
    expect(tasks.createdAt).toBeDefined();
  });

  it("should have knowledges table with correct columns", () => {
    expect(knowledges).toBeDefined();
    expect(knowledges.id).toBeDefined();
    expect(knowledges.name).toBeDefined();
    expect(knowledges.description).toBeDefined();
    expect(knowledges.content).toBeDefined();
    expect(knowledges.updatedAt).toBeDefined();
  });

  it("should have agents table with correct columns", () => {
    expect(agents).toBeDefined();
    expect(agents.id).toBeDefined();
    expect(agents.name).toBeDefined();
    expect(agents.type).toBeDefined();
    expect(agents.schedule).toBeDefined();
    expect(agents.config).toBeDefined();
    expect(agents.enabled).toBeDefined();
    expect(agents.createdAt).toBeDefined();
  });

  it("should have agentExecutions table with correct columns", () => {
    expect(agentExecutions).toBeDefined();
    expect(agentExecutions.id).toBeDefined();
    expect(agentExecutions.agentId).toBeDefined();
    expect(agentExecutions.sessionId).toBeDefined();
    expect(agentExecutions.status).toBeDefined();
    expect(agentExecutions.startedAt).toBeDefined();
    expect(agentExecutions.completedAt).toBeDefined();
    expect(agentExecutions.durationMs).toBeDefined();
    expect(agentExecutions.errorMessage).toBeDefined();
    expect(agentExecutions.output).toBeDefined();
  });

  it("should have lessons table with correct columns", () => {
    expect(lessons).toBeDefined();
    expect(lessons.id).toBeDefined();
    expect(lessons.sessionId).toBeDefined();
    expect(lessons.taskId).toBeDefined();
    expect(lessons.toolName).toBeDefined();
    expect(lessons.errorPattern).toBeDefined();
    expect(lessons.reflection).toBeDefined();
    expect(lessons.resolution).toBeDefined();
    expect(lessons.severity).toBeDefined();
    expect(lessons.tags).toBeDefined();
    expect(lessons.createdAt).toBeDefined();
  });

  it("should have inboxTasks table with correct columns", () => {
    expect(inboxTasks).toBeDefined();
    expect(inboxTasks.id).toBeDefined();
    expect(inboxTasks.intent).toBeDefined();
    expect(inboxTasks.autonomyLevel).toBeDefined();
    expect(inboxTasks.summary).toBeDefined();
    expect(inboxTasks.slackChannel).toBeDefined();
    expect(inboxTasks.slackMessageTs).toBeDefined();
    expect(inboxTasks.slackThreadTs).toBeDefined();
    expect(inboxTasks.approvalChannel).toBeDefined();
    expect(inboxTasks.approvalMessageTs).toBeDefined();
    expect(inboxTasks.status).toBeDefined();
    expect(inboxTasks.originalMessage).toBeDefined();
    expect(inboxTasks.executionPrompt).toBeDefined();
    expect(inboxTasks.sessionId).toBeDefined();
    expect(inboxTasks.result).toBeDefined();
    expect(inboxTasks.costUsd).toBeDefined();
    expect(inboxTasks.createdAt).toBeDefined();
    expect(inboxTasks.startedAt).toBeDefined();
    expect(inboxTasks.completedAt).toBeDefined();
  });
});
