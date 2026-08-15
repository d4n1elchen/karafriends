export function getJoysoundTelopDuration(
  data: ArrayBufferLike | ArrayBufferView<ArrayBufferLike>,
): number {
  const view = ArrayBuffer.isView(data)
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data);

  if (view.byteLength < 10) {
    throw new Error(
      `Invalid Joysound telop data: expected at least 10 bytes, received ${view.byteLength}.`,
    );
  }

  const metadataOffset = view.getUint32(6, true);
  const metadataSize = 20;
  if (metadataOffset > view.byteLength - metadataSize) {
    throw new Error(
      `Invalid Joysound telop data: metadata offset ${metadataOffset} is outside a ${view.byteLength}-byte payload.`,
    );
  }

  return view.getUint16(metadataOffset + 18, true);
}

export function getJoysoundOggPlaytime(oggBuffer: Buffer): number {
  const fieldTag = Buffer.from("playtime=", "ascii");
  let tagOffset = oggBuffer.indexOf(fieldTag);

  while (tagOffset >= 0 && tagOffset < 4) {
    tagOffset = oggBuffer.indexOf(fieldTag, tagOffset + fieldTag.length);
  }
  if (tagOffset < 0) {
    throw new Error("Invalid Joysound OGG data: playtime field is missing.");
  }

  const encodedFieldLength = oggBuffer.readUInt32LE(tagOffset - 4);
  const valueLength = encodedFieldLength - fieldTag.length;
  const valueOffset = tagOffset + fieldTag.length;
  if (
    encodedFieldLength < fieldTag.length ||
    valueLength <= 0 ||
    valueOffset + valueLength > oggBuffer.length
  ) {
    throw new Error(
      `Invalid Joysound OGG data: playtime field length ${encodedFieldLength} exceeds the ${oggBuffer.length}-byte payload.`,
    );
  }

  const playtimeString = oggBuffer
    .subarray(valueOffset, valueOffset + valueLength)
    .toString("ascii");
  if (!/^\d+$/.test(playtimeString)) {
    throw new Error(
      "Invalid Joysound OGG data: playtime value is not numeric.",
    );
  }

  const playtime = Number(playtimeString);
  if (!Number.isSafeInteger(playtime) || playtime <= 0) {
    throw new Error("Invalid Joysound OGG data: playtime is out of range.");
  }
  return playtime;
}
