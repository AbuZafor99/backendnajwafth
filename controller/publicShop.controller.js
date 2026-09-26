import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";

// Books belong to seller User IDs, not Shop document IDs. As in the admin
// directory, sellers without a configured shop are included with a name fallback.
export const getPublicShops = catchAsync(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 12);
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isSafeInteger((page - 1) * limit)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid pagination: page must be positive and limit must be between 1 and 50");
  }

  const filter = { role: "seller", deletedAt: null };
  const [sellers, total] = await Promise.all([
    User.find(filter).select("_id name username").sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const shops = await Shop.find({ owner: { $in: sellers.map((seller) => seller._id) } })
    .select("_id owner name description address banner").lean();
  const byOwner = new Map(shops.map((shop) => [String(shop.owner), shop]));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookstores retrieved successfully",
    data: {
      shops: sellers.map((seller) => {
        const shop = byOwner.get(String(seller._id));
        // Explicit allowlist: never return certificates, contacts, tokens,
        // personal addresses, or other private owner/account fields.
        return {
          ownerId: String(seller._id),
          shopId: shop ? String(shop._id) : null,
          name: shop?.name || seller.name || seller.username || "Books store",
          description: shop?.description || "",
          address: shop?.address || "",
          banner: (shop?.banner || []).filter((image) => image.url)
            .map((image) => ({ url: image.url })),
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
});
