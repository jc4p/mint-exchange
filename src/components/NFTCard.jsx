/** @jsx jsx */
import { jsx } from 'hono/jsx'

export const NFTCard = ({ nft }) => {
  return (
    <article class="nft-card" data-id={nft.id}>
      <div class="nft-card-image-wrapper">
        <img 
          src={nft.image || '/placeholder.png'} 
          alt={nft.name}
          class="nft-card-image"
          loading="lazy"
        />
      </div>
      <div class="nft-card-content">
        <h3 class="nft-card-name">{nft.name}</h3>
        <div class="nft-card-price">
          <span class="nft-card-price-amount">{nft.price}</span>
          <span class="nft-card-price-currency">USDC</span>
        </div>
      </div>
    </article>
  )
}