import { expect, test } from "vitest";
import { runTaskRequest } from "./processor";

test("the ECS request lists every subnet from the comma-separated setting and runs on Fargate Spot", () => {
  const body = runTaskRequest(" subnet-a, subnet-b,,subnet-c ", " sg-1 ");
  expect(body.networkConfiguration.awsvpcConfiguration).toEqual({
    subnets: ["subnet-a", "subnet-b", "subnet-c"],
    securityGroups: ["sg-1"],
    assignPublicIp: "ENABLED",
  });
  expect(body.capacityProviderStrategy).toEqual([{ capacityProvider: "FARGATE_SPOT", weight: 1 }]);
});
