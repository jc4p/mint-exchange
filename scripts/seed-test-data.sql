-- Seed test data for development
-- This script adds sample data to test the NFT Exchange

-- Add more test users
INSERT INTO users (fid, username, display_name, wallet_address, pfp_url) VALUES 
(2345, 'artcollector', 'Art Collector', '0x2234567890123456789012345678901234567890', 'https://i.pravatar.cc/150?u=artcollector'),
(3456, 'nftwhale', 'NFT Whale 🐋', '0x3334567890123456789012345678901234567890', 'https://i.pravatar.cc/150?u=nftwhale'),
(4567, 'creator123', 'Digital Artist', '0x4434567890123456789012345678901234567890', 'https://i.pravatar.cc/150?u=creator123'),
(5678, 'moonboy', 'To The Moon 🚀', '0x5534567890123456789012345678901234567890', 'https://i.pravatar.cc/150?u=moonboy');

-- Add more test listings
INSERT INTO listings (listing_id, seller_address, nft_contract, token_id, price, expiry, name, image_url, description) VALUES 
(2, '0x2234567890123456789012345678901234567890', '0xbc3791aad2a0057890c881e17e5aef18eb315918', '42', 25.0, datetime('now', '+5 days'), 'Cosmic Voyage #42', 'https://picsum.photos/seed/cosmic42/400/400', 'A journey through the cosmos captured in digital art.'),
(3, '0x3334567890123456789012345678901234567890', '0x79fcdef22feed20eddacbb2587640e45491b757f', '101', 150.99, datetime('now', '+10 days'), 'Rare Pepe #101', 'https://picsum.photos/seed/pepe101/400/400', 'One of the rarest Pepes in existence. HODL!'),
(4, '0x4434567890123456789012345678901234567890', '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e', '777', 77.77, datetime('now', '+7 days'), 'Lucky Sevens', 'https://picsum.photos/seed/lucky777/400/400', 'Triple sevens bring triple luck. Limited edition.'),
(5, '0x5534567890123456789012345678901234567890', '0x60e4d786628fea6478f785a6d7e704777c86a7c6', '1337', 420.69, datetime('now', '+14 days'), 'Elite Ape #1337', 'https://picsum.photos/seed/ape1337/400/400', 'The most elite of all apes. Diamond hands only.'),
(6, '0x2234567890123456789012345678901234567890', '0xbd3531da5cf5857e7cfaa92426877b022e612cf8', '88', 8.88, datetime('now', '+3 days'), 'Lucky Cat #88', 'https://picsum.photos/seed/cat88/400/400', 'Brings fortune and good vibes to your wallet.'),
(7, '0x4434567890123456789012345678901234567890', '0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b', '2024', 50.0, datetime('now', '+6 days'), 'Cyber Punk 2024', 'https://picsum.photos/seed/cyber2024/400/400', 'Retro-futuristic art from an alternate timeline.'),
(8, '0x3334567890123456789012345678901234567890', '0x23581767a106ae21c074b2276d25e5c3e136a68b', '999', 99.99, datetime('now', '+9 days'), 'Pixel Perfect #999', 'https://picsum.photos/seed/pixel999/400/400', 'Every pixel placed with purpose. True digital craftsmanship.');

-- Add some activity
INSERT INTO activity (type, actor_address, nft_contract, token_id, price, metadata) VALUES
('listing_created', '0x1234567890123456789012345678901234567890', '0xabcdef1234567890abcdef1234567890abcdef12', '1', 10.5, '{"listing_id": 1}'),
('listing_created', '0x2234567890123456789012345678901234567890', '0xbc3791aad2a0057890c881e17e5aef18eb315918', '42', 25.0, '{"listing_id": 2}'),
('listing_created', '0x3334567890123456789012345678901234567890', '0x79fcdef22feed20eddacbb2587640e45491b757f', '101', 150.99, '{"listing_id": 3}'),
('offer_made', '0x5534567890123456789012345678901234567890', '0xabcdef1234567890abcdef1234567890abcdef12', '1', 8.0, '{"listing_id": 1, "offer_id": 1}'),
('sale', '0x5534567890123456789012345678901234567890', '0xbc3791aad2a0057890c881e17e5aef18eb315918', '42', 25.0, '{"listing_id": 2, "seller": "0x2234567890123456789012345678901234567890"}');