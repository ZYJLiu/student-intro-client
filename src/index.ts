import { initializeKeypair } from "./initializeKeypair";
import * as web3 from "@solana/web3.js";
import * as borsh from "@project-serum/borsh";

let programId = new web3.PublicKey(
  "6BaDaoXx678yvTUpYFLEYSHrrsxq81Xh8maoXL3pYjb"
);

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  const signer = await initializeKeypair(connection);

  const reviewInstruction = await createReviewInstruction(
    signer,
    "name",
    "message"
  );
  const [pda] = await web3.PublicKey.findProgramAddress(
    [signer.publicKey.toBuffer()],
    programId
  );
  const commentInstruction = await createCommentInstruction(
    connection,
    signer,
    pda,
    "reply"
  );

  const transactionSignature = await compileAndSendTransaction(
    connection,
    [commentInstruction],
    signer
  );

  await fetchComments(connection, pda);

  console.log(
    `Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  );
}

main()
  .then(() => {
    console.log("Finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });

async function createReviewInstruction(
  payer: web3.Keypair,
  name: string,
  message: string
): Promise<web3.TransactionInstruction> {
  const [pda] = await web3.PublicKey.findProgramAddress(
    [payer.publicKey.toBuffer()],
    programId
  );

  const [pda_counter] = await web3.PublicKey.findProgramAddress(
    [pda.toBuffer(), Buffer.from("reply")],
    programId
  );

  const borshInstructionSchema = borsh.struct([
    borsh.u8("variant"),
    borsh.str("name"),
    borsh.str("msg"),
  ]);

  const payload = {
    variant: 0,
    name: name,
    msg: message,
  };

  const buffer = Buffer.alloc(1000);
  borshInstructionSchema.encode(payload, buffer);
  const data = buffer.slice(0, borshInstructionSchema.getSpan(buffer));

  const transaction = new web3.Transaction();

  const instruction = new web3.TransactionInstruction({
    keys: [
      {
        pubkey: payer.publicKey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: pda,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pda_counter,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: data,
    programId,
  });

  return instruction;
}

async function createCommentInstruction(
  connection: web3.Connection,
  payer: web3.Keypair,
  reviewPubkey: web3.PublicKey,
  reply: string
): Promise<web3.TransactionInstruction> {
  const [pda_counter] = await web3.PublicKey.findProgramAddress(
    [reviewPubkey.toBuffer(), Buffer.from("reply")],
    programId
  );

  const review_metadata = await connection.getAccountInfo(pda_counter);

  const borshAccountSchema = borsh.struct([
    borsh.str("discriminator"),
    borsh.bool("is_initialized"),
    borsh.u8("counter"),
  ]);
  const count: number = borshAccountSchema.decode(
    review_metadata?.data
  ).counter;

  console.log("count", count);

  const [pda_comment] = await web3.PublicKey.findProgramAddress(
    [reviewPubkey.toBuffer(), Buffer.from([count])],
    programId
  );

  const borshInstructionSchema = borsh.struct([
    borsh.u8("variant"),
    borsh.str("reply"),
  ]);

  const payload = {
    variant: 2,
    reply: reply,
  };

  const buffer = Buffer.alloc(1000);
  borshInstructionSchema.encode(payload, buffer);
  const data = buffer.slice(0, borshInstructionSchema.getSpan(buffer));

  const instruction = new web3.TransactionInstruction({
    keys: [
      {
        pubkey: payer.publicKey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: reviewPubkey,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pda_counter,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pda_comment,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: data,
    programId,
  });

  return instruction;
}

async function fetchComments(
  connection: web3.Connection,
  reviewPubkey: web3.PublicKey
) {
  const [pda_counter] = await web3.PublicKey.findProgramAddress(
    [reviewPubkey.toBuffer(), Buffer.from("reply")],
    programId
  );

  const review_metadata = await connection.getAccountInfo(pda_counter);

  const borshAccountSchema = borsh.struct([
    borsh.str("discriminator"),
    borsh.bool("is_initialized"),
    borsh.u8("counter"),
  ]);
  const count: number = borshAccountSchema.decode(
    review_metadata?.data
  ).counter;

  const comment_list = [];

  for (let i = 0; i < count; i++) {
    const [pda_comment] = await web3.PublicKey.findProgramAddress(
      [reviewPubkey.toBuffer(), Buffer.from([i])],
      programId
    );
    comment_list.push(pda_comment);
    // console.log(comment_list);
  }

  const comment_account = await connection.getMultipleAccountsInfo(
    comment_list
  );

  //   console.log(comment_account);

  const borshCommentAccountSchema = borsh.struct([
    borsh.str("discriminator"),
    borsh.bool("is_initialized"),
    borsh.publicKey("studentinfo"),
    borsh.str("reply"),
  ]);

  const comments = [];

  for (let i = 0; i < comment_account.length; i++) {
    const comment: string = borshCommentAccountSchema.decode(
      comment_account[i]?.data
    ).reply;
    comments.push(comment);
    console.log(comment);
  }
  console.log(comments);
}

async function compileAndSendTransaction(
  connection: web3.Connection,
  instructions: web3.TransactionInstruction[],
  signer: web3.Keypair
): Promise<web3.TransactionSignature> {
  const transaction = new web3.Transaction();
  instructions.map((ix) => transaction.add(ix));
  const transactionSignature = await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [signer]
  );
  return transactionSignature;
}
