import {
  CREATOR_DETAIL_PAGE_SIZE,
  DEFAULT_CREATOR_DETAIL_PARAMS,
  buildCreatorDetailQuery,
  creatorDetailAfterContractChange,
  creatorDetailAfterFilterChange,
  creatorDetailBase,
  creatorDetailHref,
  isCreatorDetailFiltered,
  parseCreatorDetailParams,
  type CreatorDetailParams,
} from "./creator-detail";

const CONTRACT = "3f2b8c1e-5d4a-4e7b-9c1d-2a6f8b0e4d11";
const OTHER_CONTRACT = "9a1c7e52-0b3d-4f68-8e2a-6c5d4b3a2f10";

const BARE: CreatorDetailParams = {
  contract: null,
  type: [],
  status: [],
  page: 1,
};

describe("CREATOR_DETAIL_PAGE_SIZE", () => {
  it("is the ten rows a page that 4.1 serves and 4.2 shows", () => {
    expect(CREATOR_DETAIL_PAGE_SIZE).toBe(10);
  });
});

describe("parseCreatorDetailParams", () => {
  it("reads an empty address as the newest contract, unfiltered, on page one", () => {
    expect(parseCreatorDetailParams({})).toEqual(BARE);
    expect(DEFAULT_CREATOR_DETAIL_PARAMS).toEqual(BARE);
  });

  it("reads the contract, the filters and the page as they were written", () => {
    expect(
      parseCreatorDetailParams({
        contract: CONTRACT,
        type: "specific",
        status: "draft_review,draft_revision",
        page: "3",
      }),
    ).toEqual({
      contract: CONTRACT,
      type: ["specific"],
      status: ["draft_review", "draft_revision"],
      page: 3,
    });
  });

  it("takes a contract id in capitals, as an id is the same id either way", () => {
    expect(parseCreatorDetailParams({ contract: CONTRACT.toUpperCase() }).contract).toBe(
      CONTRACT.toUpperCase(),
    );
  });

  it.each([
    ["a word", "terbaru"],
    ["an id cut short", CONTRACT.slice(0, 20)],
    ["an id with a query behind it", `${CONTRACT}' OR '1'='1`],
    ["a path", "../../contents"],
    ["nothing", ""],
  ])("ignores a contract that is %s, falling back to the newest", (_, contract) => {
    expect(parseCreatorDetailParams({ contract }).contract).toBeNull();
  });

  it("drops a status or a type the content cannot hold and keeps the rest", () => {
    const state = parseCreatorDetailParams({
      type: "evergreen,weekly",
      status: "draft_revised,scheduled,<script>",
    });

    expect(state.type).toEqual(["evergreen"]);
    expect(state.status).toEqual(["scheduled"]);
  });

  it.each(["0", "-2", "abc", "1.5", "", " 2"])(
    "reads the page %j as the first page",
    (page) => {
      expect(parseCreatorDetailParams({ page }).page).toBe(1);
    },
  );

  it("takes the first value of a single-valued parameter that arrives twice", () => {
    expect(
      parseCreatorDetailParams({
        contract: [CONTRACT, OTHER_CONTRACT],
        page: ["2", "9"],
      }),
    ).toEqual({ ...BARE, contract: CONTRACT, page: 2 });
  });

  it("keeps every pick of a filter that arrives repeated, as it keeps comma-separated ones", () => {
    const repeated = parseCreatorDetailParams({
      type: ["specific", "evergreen"],
      status: ["scheduled", "pending"],
    });

    expect(repeated).toEqual(
      parseCreatorDetailParams({ type: "specific,evergreen", status: "scheduled,pending" }),
    );
    expect(repeated.status).toEqual(["scheduled", "pending"]);
  });
});

describe("creatorDetailBase", () => {
  it("is the creator's own address under the Creator Database", () => {
    expect(creatorDetailBase("creator-1")).toBe("/admin/creators/creator-1");
  });

  it("encodes an id that could otherwise step out of the path", () => {
    expect(creatorDetailBase("../submissions?x=1")).toBe(
      "/admin/creators/..%2Fsubmissions%3Fx%3D1",
    );
  });
});

describe("buildCreatorDetailQuery", () => {
  it("is empty for the bare view, so it stays at the bare address", () => {
    expect(buildCreatorDetailQuery(BARE)).toEqual({});
  });

  it("writes only what differs from the default, in a stable order", () => {
    const query = buildCreatorDetailQuery({
      contract: CONTRACT,
      type: ["evergreen", "specific"],
      status: ["scheduled"],
      page: 2,
    });

    expect(query).toEqual({
      contract: CONTRACT,
      type: "evergreen,specific",
      status: "scheduled",
      page: "2",
    });
    expect(Object.keys(query)).toEqual(["contract", "type", "status", "page"]);
  });

  it("leaves page one out", () => {
    expect(buildCreatorDetailQuery({ ...BARE, contract: CONTRACT, page: 1 })).toEqual({
      contract: CONTRACT,
    });
  });

  it("reads back as the state it was built from", () => {
    const state: CreatorDetailParams = {
      contract: CONTRACT,
      type: ["specific"],
      status: ["draft_approved", "link_submitted"],
      page: 4,
    };

    expect(parseCreatorDetailParams(buildCreatorDetailQuery(state))).toEqual(state);
  });
});

describe("creatorDetailHref", () => {
  it("is the bare address for the bare view", () => {
    expect(creatorDetailHref("creator-1", BARE)).toBe("/admin/creators/creator-1");
  });

  it("carries the state behind the creator's address", () => {
    expect(
      creatorDetailHref("creator-1", { ...BARE, contract: CONTRACT, status: ["pending"], page: 2 }),
    ).toBe(`/admin/creators/creator-1?contract=${CONTRACT}&status=pending&page=2`);
  });
});

describe("isCreatorDetailFiltered", () => {
  it("is false for the bare view", () => {
    expect(isCreatorDetailFiltered(BARE)).toBe(false);
  });

  it("is false when only the contract or the page was chosen, as neither narrows the table", () => {
    expect(isCreatorDetailFiltered({ ...BARE, contract: CONTRACT, page: 3 })).toBe(false);
  });

  it("is true once a type or a status is picked", () => {
    expect(isCreatorDetailFiltered({ ...BARE, type: ["evergreen"] })).toBe(true);
    expect(isCreatorDetailFiltered({ ...BARE, status: ["scheduled"] })).toBe(true);
  });
});

describe("creatorDetailAfterFilterChange", () => {
  it("applies the pick and returns to page one, where the narrowed table starts", () => {
    const state: CreatorDetailParams = { ...BARE, contract: CONTRACT, type: ["evergreen"], page: 3 };

    expect(creatorDetailAfterFilterChange(state, { status: ["scheduled"] })).toEqual({
      contract: CONTRACT,
      type: ["evergreen"],
      status: ["scheduled"],
      page: 1,
    });
  });

  it("leaves the state it was given untouched", () => {
    const state: CreatorDetailParams = { ...BARE, page: 3 };
    creatorDetailAfterFilterChange(state, { type: ["specific"] });

    expect(state).toEqual({ ...BARE, page: 3 });
  });
});

describe("creatorDetailAfterContractChange", () => {
  it("opens the other contract unfiltered on page one, as the prototype does on a period tab", () => {
    const state: CreatorDetailParams = {
      contract: CONTRACT,
      type: ["specific"],
      status: ["draft_review"],
      page: 2,
    };

    expect(creatorDetailAfterContractChange(state, OTHER_CONTRACT)).toEqual({
      ...BARE,
      contract: OTHER_CONTRACT,
    });
  });
});
