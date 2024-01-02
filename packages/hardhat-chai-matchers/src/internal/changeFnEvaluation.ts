import type {
  BigNumberish,
  TransactionResponse,
  default as EthersT,
} from "ethers";

import { buildAssert } from "../utils";
import { ensure } from "./calledOnContract/utils";
import { CHANGE_FN_EVALUATION } from "./constants";
import { assertIsNotNull, preventAsyncMatcherChaining } from "./utils";

export function supportFnEvaluation(
  Assertion: Chai.AssertionStatic,
  chaiUtils: Chai.ChaiUtils
) {
  Assertion.addMethod(
    CHANGE_FN_EVALUATION,
    function (
      this: any,
      fn: (Blocktag: string) => any,
      change: BigNumberish
    ) {
      const { toBigInt } = require("ethers") as typeof EthersT;
      // capture negated flag before async code executes; see buildAssert's jsdoc
      const negated = this.__flags.negate;
      const subject = this._obj;

      preventAsyncMatcherChaining(
        this,
        CHANGE_FN_EVALUATION,
        chaiUtils
      );

      const checkFnChange = (actualChange: bigint) => {
        const assert = buildAssert(negated, checkFnChange);

        const expectedChange = toBigInt(change);

        assert(
          actualChange === expectedChange,
          `Expected the function return to change by ${change.toString()}, but it changed by ${actualChange.toString()}`,
          `Expected the function return NOT to change by ${change.toString()} wei, but it did`
        );
      };

      const derivedPromise = getFnChange(subject, fn).then(checkFnChange);
      this.then = derivedPromise.then.bind(derivedPromise);
      this.catch = derivedPromise.catch.bind(derivedPromise);
      this.promise = derivedPromise;
      return this;
    }
  );
}

export async function getFnChange(
  transaction:
    | TransactionResponse
    | Promise<TransactionResponse>
    | (() => Promise<TransactionResponse> | TransactionResponse),
  fn: (Blocktag: string) => any
): Promise<bigint> {
  const hre = await import("hardhat");
  const provider = hre.network.provider;

  let txResponse: TransactionResponse;

  if (typeof transaction === "function") {
    txResponse = await transaction();
  } else {
    txResponse = await transaction;
  }

  const txReceipt = await txResponse.wait();
  assertIsNotNull(txReceipt, "txReceipt");
  const txBlockNumber = txReceipt.blockNumber;

  const block = await provider.send("eth_getBlockByHash", [
    txReceipt.blockHash,
    false,
  ]);

  ensure(
    block.transactions.length === 1,
    Error,
    "Multiple transactions found in block"
  );


  const evaluationAfterHex = await fn(`0x${txBlockNumber.toString(16)}`);
  const evaluationBeforeHex = await fn(`0x${(txBlockNumber - 1).toString(16)}`);

  const evaluationAfter = BigInt(evaluationAfterHex);
  const evaluationBefore = BigInt(evaluationBeforeHex);

 
  return evaluationAfter - evaluationBefore;
}
