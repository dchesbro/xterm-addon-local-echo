import { History } from "../src/History";

describe("HistoryController", () => {
  test("history size", () => {
    const historySize = 3;
    const historyController = new History(historySize);

    historyController.push("1");
    historyController.push("2");
    historyController.push("3");
    historyController.push("4");
    historyController.push("5");

    expect(historyController.items).toEqual(["3", "4", "5"]);
  });

  test("history.getPrev(), history.getNext()", () => {
    const historySize = 10;
    const historyController = new History(historySize);

    expect(historyController.getPrev()).toBeUndefined();

    historyController.push("1");
    historyController.push("2");
    historyController.push("3");
    historyController.push("3");

    expect(historyController.getNext()).toBeUndefined();
    expect(historyController.getPrev()).toEqual("3");

    historyController.push("3");
    historyController.push("3");

    expect(historyController.getPrev()).toEqual("3");
    expect(historyController.getPrev()).toEqual("2");
    expect(historyController.getPrev()).toEqual("1");
    expect(historyController.getNext()).toEqual("2");
    expect(historyController.getNext()).toEqual("3");
    expect(historyController.getNext()).toBeUndefined();
  });
});
