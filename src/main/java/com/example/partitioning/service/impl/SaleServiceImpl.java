package com.example.partitioning.service.impl;

import com.example.partitioning.entity.Sale;
import com.example.partitioning.repository.SaleRepository;
import com.example.partitioning.service.SaleService;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class SaleServiceImpl implements SaleService {
    private final SaleRepository saleRepository;

    public SaleServiceImpl(SaleRepository saleRepository) {
        this.saleRepository = saleRepository;
    }

    @Override
    public Sale create(Sale sale) {
        sale.setId(null);
        return saleRepository.save(sale);
    }

    @Override
    public List<Sale> findAll() {
        return saleRepository.findAllByOrderBySaleDateDescIdDesc();
    }

    @Override
    public Sale update(Long id, Sale sale) {
        Sale existingSale = findById(id);
        existingSale.setSaleDate(sale.getSaleDate());
        existingSale.setAmount(sale.getAmount());
        return saleRepository.save(existingSale);
    }

    @Override
    public void delete(Long id) {
        saleRepository.delete(findById(id));
    }

    private Sale findById(Long id) {
        return saleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Sale not found"));
    }
}
